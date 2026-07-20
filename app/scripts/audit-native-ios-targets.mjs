#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { IOSConfig } = require('expo/config-plugins');
const plist = require('plist');

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..');
const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_PROJECT_ROOT, 'ios-signing-targets.json');
const SIGNABLE_PRODUCT_TYPE_PREFIXES = [
  'com.apple.product-type.application',
  'com.apple.product-type.app-extension',
];
const ADDITIONAL_SIGNABLE_PRODUCT_TYPES = new Set([
  'com.apple.product-type.watchkit-extension',
  'com.apple.product-type.watchkit2-extension',
]);
const OMITTED_PROJECT_DIRECTORIES = new Set([
  '.expo',
  '.git',
  '.voltra',
  'android',
  'coverage',
  'dist',
  'ios',
  'node_modules',
  'web-build',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function printable(value) {
  return JSON.stringify(canonicalize(value));
}

function unquote(value) {
  if (value === undefined || value === null) return null;
  return IOSConfig.XcodeUtils.unquote(value).trim();
}

function unresolvedBuildSetting(value) {
  return typeof value === 'string' && /\$\([^)]+\)|\$\{[^}]+\}/.test(value);
}

function resolveBuildSetting(value, settings, builtIns = {}) {
  let resolved = unquote(value);
  if (resolved === null) return null;

  const lookup = (name) => {
    const candidate = builtIns[name] ?? settings[name];
    return candidate === undefined || candidate === null ? undefined : unquote(candidate);
  };
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const next = IOSConfig.XcodeUtils.resolveXcodeBuildSetting(resolved, lookup)?.replace(
      /\$\{([^}]+)\}/g,
      (match, name) => lookup(name) ?? match
    );
    if (next === resolved || next === undefined) break;
    resolved = next;
  }
  return unquote(resolved);
}

export function isSignableProductType(productType) {
  const normalized = unquote(productType);
  if (!normalized) return false;
  return (
    SIGNABLE_PRODUCT_TYPE_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}.`)
    ) || ADDITIONAL_SIGNABLE_PRODUCT_TYPES.has(normalized)
  );
}

function projectReleaseBuildSettings(project) {
  const projectEntries = Object.entries(project.pbxProjectSection()).filter(
    ([key]) => !key.endsWith('_comment')
  );
  if (projectEntries.length === 0) return {};
  const projectObject = projectEntries[0][1];
  if (!projectObject?.buildConfigurationList) return {};
  try {
    const [, release] = IOSConfig.XcodeUtils.getBuildConfigurationForListIdAndName(project, {
      configurationListId: projectObject.buildConfigurationList,
      buildConfiguration: 'Release',
    });
    return isRecord(release.buildSettings) ? release.buildSettings : {};
  } catch {
    return {};
  }
}

/**
 * Extract semantic Release signing settings from a parsed Xcode project.
 * This helper is pure: callers supply the parsed project and project directory.
 */
export function extractReleaseTargetDescriptors(project, { projectDirectory = '' } = {}) {
  const errors = [];
  const targets = [];
  const sharedSettings = projectReleaseBuildSettings(project);

  for (const [, target] of IOSConfig.Target.getNativeTargets(project)) {
    const productType = unquote(target.productType);
    if (!isSignableProductType(productType)) continue;

    const targetName = unquote(target.name ?? target.productName);
    if (!targetName) {
      errors.push(`A signable native target in ${projectDirectory || 'the Xcode project'} has no name.`);
      continue;
    }

    let release;
    try {
      [, release] = IOSConfig.XcodeUtils.getBuildConfigurationForListIdAndName(project, {
        configurationListId: target.buildConfigurationList,
        buildConfiguration: 'Release',
      });
    } catch (error) {
      errors.push(`Native target "${targetName}" has no auditable Release configuration: ${error.message}`);
      continue;
    }

    const settings = {
      ...sharedSettings,
      ...(isRecord(release.buildSettings) ? release.buildSettings : {}),
    };
    const builtIns = {
      PROJECT_DIR: projectDirectory,
      SRCROOT: projectDirectory,
      TARGET_NAME: targetName,
      PRODUCT_NAME: resolveBuildSetting(settings.PRODUCT_NAME, settings, { TARGET_NAME: targetName }) ?? targetName,
    };
    const bundleIdentifier = resolveBuildSetting(
      settings.PRODUCT_BUNDLE_IDENTIFIER,
      settings,
      builtIns
    );
    const entitlementsPath = resolveBuildSetting(
      settings.CODE_SIGN_ENTITLEMENTS,
      settings,
      builtIns
    );

    if (!bundleIdentifier) {
      errors.push(`Native target "${targetName}" has no Release PRODUCT_BUNDLE_IDENTIFIER.`);
      continue;
    }
    if (unresolvedBuildSetting(bundleIdentifier)) {
      errors.push(
        `Native target "${targetName}" has an unresolved Release bundle identifier ` +
          `"${bundleIdentifier}".`
      );
      continue;
    }
    if (entitlementsPath && unresolvedBuildSetting(entitlementsPath)) {
      errors.push(
        `Native target "${targetName}" has an unresolved CODE_SIGN_ENTITLEMENTS path ` +
          `"${entitlementsPath}".`
      );
      continue;
    }

    targets.push({
      targetName,
      productType,
      bundleIdentifier,
      entitlementsPath: entitlementsPath || null,
      projectDirectory,
    });
  }

  targets.sort((left, right) => left.targetName.localeCompare(right.targetName));
  return { targets, errors };
}

function expectedTargetType(target) {
  return target.parentBundleIdentifier === null ? 'application' : 'extension';
}

function actualTargetType(target) {
  return target.productType.startsWith('com.apple.product-type.application')
    ? 'application'
    : 'extension';
}

/** Compare semantic native target data with the checked-in signing manifest. */
export function compareNativeSigningTargets(nativeTargets, manifestTargets) {
  const errors = [];
  if (!Array.isArray(nativeTargets)) return ['Native iOS targets must be an array.'];
  if (!Array.isArray(manifestTargets)) return ['Signing manifest targets must be an array.'];

  const nativeByName = new Map();
  for (const target of nativeTargets) {
    if (nativeByName.has(target.targetName)) {
      errors.push(`Generated Xcode project repeats native target "${target.targetName}".`);
    }
    nativeByName.set(target.targetName, target);
  }
  const manifestByName = new Map();
  for (const target of manifestTargets) {
    if (manifestByName.has(target.targetName)) {
      errors.push(`Signing manifest repeats target "${target.targetName}".`);
    }
    manifestByName.set(target.targetName, target);
  }

  for (const expected of manifestTargets) {
    const actual = nativeByName.get(expected.targetName);
    if (!actual) {
      errors.push(`Generated Xcode project is missing manifest target "${expected.targetName}".`);
      continue;
    }
    if (actual.bundleIdentifier !== expected.bundleIdentifier) {
      errors.push(
        `Native target "${expected.targetName}" bundle identifier drift: expected ` +
          `"${expected.bundleIdentifier}", generated "${actual.bundleIdentifier}".`
      );
    }
    if (actualTargetType(actual) !== expectedTargetType(expected)) {
      errors.push(
        `Native target "${expected.targetName}" product type drift: manifest expects an ` +
          `${expectedTargetType(expected)}, generated ${actual.productType}.`
      );
    }
    if (printable(actual.entitlements ?? {}) !== printable(expected.entitlements ?? {})) {
      errors.push(
        `Native target "${expected.targetName}" entitlement drift: expected ` +
          `${printable(expected.entitlements ?? {})}, generated ` +
          `${printable(actual.entitlements ?? {})}.`
      );
    }
  }

  for (const actual of nativeTargets) {
    if (!manifestByName.has(actual.targetName)) {
      errors.push(
        `Generated Xcode project contains untracked signable target "${actual.targetName}" ` +
          `(${actual.bundleIdentifier}). Provision it before adding it to ios-signing-targets.json.`
      );
    }
  }

  return errors;
}

export function trackedNativeIosProjectError(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) return null;
  const sample = [...filePaths].sort().slice(0, 3).join(', ');
  return (
    `Tracked native iOS files detected (${sample}). This guard audits a clean managed Expo ` +
    'prebuild; extend it to audit the committed Xcode project before releasing a bare project.'
  );
}

function listTrackedNativeIosFiles(projectRoot) {
  const result = spawnSync('git', ['ls-files', '--', 'ios'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error) {
    throw new Error(`Unable to inspect tracked native iOS files: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Unable to inspect tracked native iOS files (git exited ${result.status}): ` +
        `${result.stderr.trim()}`
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function shouldCopyProjectEntry(projectRoot, sourcePath) {
  const relativePath = path.relative(projectRoot, sourcePath);
  if (relativePath === '') return true;
  const [topLevelEntry] = relativePath.split(path.sep);
  if (OMITTED_PROJECT_DIRECTORIES.has(topLevelEntry)) return false;
  const basename = path.basename(relativePath);
  if (/^\.env(?:\..*)?\.local$/.test(basename) || basename === '.DS_Store') return false;
  return true;
}

async function createTemporaryProject(projectRoot) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'ios-target-audit-'));
  const temporaryProjectRoot = path.join(temporaryRoot, 'project');
  await cp(projectRoot, temporaryProjectRoot, {
    recursive: true,
    filter: (sourcePath) => shouldCopyProjectEntry(projectRoot, sourcePath),
  });
  await symlink(path.join(projectRoot, 'node_modules'), path.join(temporaryProjectRoot, 'node_modules'));
  return { temporaryRoot, temporaryProjectRoot };
}

function resolveProductionProfile(buildProfiles, profileName = 'production', seen = new Set()) {
  if (!isRecord(buildProfiles?.[profileName])) return {};
  if (seen.has(profileName)) {
    throw new Error(`Circular EAS build-profile inheritance includes "${profileName}".`);
  }
  seen.add(profileName);
  const profile = buildProfiles[profileName];
  const inherited = typeof profile.extends === 'string'
    ? resolveProductionProfile(buildProfiles, profile.extends, seen)
    : {};
  seen.delete(profileName);
  return {
    ...inherited,
    ...profile,
    env: {
      ...(isRecord(inherited.env) ? inherited.env : {}),
      ...(isRecord(profile.env) ? profile.env : {}),
    },
  };
}

async function productionEnvironment(projectRoot) {
  const easJson = JSON.parse(await readFile(path.join(projectRoot, 'eas.json'), 'utf8'));
  const productionProfile = resolveProductionProfile(easJson.build);
  const profileEnvironment = isRecord(productionProfile.env)
    ? Object.fromEntries(
        Object.entries(productionProfile.env).filter(([, value]) => typeof value === 'string')
      )
    : {};
  return {
    ...process.env,
    ...profileEnvironment,
    BABEL_ENV: 'production',
    CI: '1',
    EAS_BUILD: 'true',
    EAS_BUILD_PLATFORM: 'ios',
    EAS_BUILD_PROFILE: 'production',
    EXPO_NO_GIT_STATUS: '1',
    EXPO_NO_TELEMETRY: '1',
    NODE_ENV: 'production',
  };
}

function runPrebuild(projectRoot, temporaryProjectRoot, env) {
  const expoExecutable = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'expo.cmd' : 'expo'
  );
  const templatePath = path.join(projectRoot, 'node_modules', 'expo', 'template.tgz');
  const result = spawnSync(
    expoExecutable,
    [
      'prebuild',
      '--platform',
      'ios',
      '--clean',
      '--no-install',
      '--template',
      templatePath,
    ],
    {
      cwd: temporaryProjectRoot,
      env,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }
  );
  if (result.error) throw new Error(`Unable to run Expo iOS prebuild: ${result.error.message}`);
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`Expo iOS prebuild exited with status ${result.status}:\n${output}`);
  }
}

async function loadGeneratedTargets(temporaryProjectRoot) {
  const iosDirectory = path.join(temporaryProjectRoot, 'ios');
  const projectDirectories = (await readdir(iosDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.xcodeproj'))
    .map((entry) => path.join(iosDirectory, entry.name))
    .sort();
  if (projectDirectories.length !== 1) {
    throw new Error(
      `Expected exactly one generated Xcode project, found ${projectDirectories.length}: ` +
        `${projectDirectories.map((entry) => path.basename(entry)).join(', ') || 'none'}.`
    );
  }

  const project = IOSConfig.XcodeUtils.getPbxproj(temporaryProjectRoot);
  const projectDirectory = path.dirname(projectDirectories[0]);
  const extracted = extractReleaseTargetDescriptors(project, { projectDirectory });
  if (extracted.errors.length > 0) {
    throw new Error(extracted.errors.join('\n'));
  }

  const targets = [];
  for (const descriptor of extracted.targets) {
    let entitlements = {};
    if (descriptor.entitlementsPath) {
      const entitlementsPath = path.resolve(descriptor.projectDirectory, descriptor.entitlementsPath);
      const relativeToTemporaryProject = path.relative(temporaryProjectRoot, entitlementsPath);
      if (
        relativeToTemporaryProject.startsWith('..') ||
        path.isAbsolute(relativeToTemporaryProject)
      ) {
        throw new Error(
          `Native target "${descriptor.targetName}" entitlements escape the temporary project: ` +
            `${descriptor.entitlementsPath}.`
        );
      }
      try {
        entitlements = plist.parse(await readFile(entitlementsPath, 'utf8'));
      } catch (error) {
        throw new Error(
          `Unable to read entitlements for native target "${descriptor.targetName}" at ` +
            `${descriptor.entitlementsPath}: ${error.message}`
        );
      }
      if (!isRecord(entitlements)) {
        throw new Error(`Entitlements for native target "${descriptor.targetName}" are not a dictionary.`);
      }
    }
    targets.push({ ...descriptor, entitlements });
  }
  return targets;
}

export async function auditNativeIosTargets({
  projectRoot = DEFAULT_PROJECT_ROOT,
  manifestPath = path.join(projectRoot, 'ios-signing-targets.json'),
} = {}) {
  projectRoot = path.resolve(projectRoot);
  manifestPath = path.resolve(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.targets)) {
    throw new Error(`Signing manifest at ${manifestPath} does not contain a targets array.`);
  }
  const trackedNativeError = trackedNativeIosProjectError(
    listTrackedNativeIosFiles(projectRoot)
  );
  if (trackedNativeError) throw new Error(trackedNativeError);

  let temporaryRoot;
  try {
    const temporary = await createTemporaryProject(projectRoot);
    temporaryRoot = temporary.temporaryRoot;
    const env = await productionEnvironment(projectRoot);
    runPrebuild(projectRoot, temporary.temporaryProjectRoot, env);
    const nativeTargets = await loadGeneratedTargets(temporary.temporaryProjectRoot);
    const errors = compareNativeSigningTargets(nativeTargets, manifest.targets);
    if (errors.length > 0) throw new Error(errors.join('\n'));
    return nativeTargets;
  } finally {
    if (temporaryRoot) {
      await rm(temporaryRoot, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 });
    }
  }
}

async function main() {
  const projectRoot = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PROJECT_ROOT;
  const manifestPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : projectRoot === DEFAULT_PROJECT_ROOT
      ? DEFAULT_MANIFEST_PATH
      : path.join(projectRoot, 'ios-signing-targets.json');
  const targets = await auditNativeIosTargets({ projectRoot, manifestPath });
  console.log(
    `Native iOS target audit passed for ${targets.length} signable targets: ` +
      targets.map((target) => target.targetName).sort().join(', ')
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`Native iOS target audit failed:\n${error.message}`);
    process.exitCode = 1;
  });
}
