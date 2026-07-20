#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST_PATH = path.resolve(SCRIPT_DIRECTORY, '..', 'ios-signing-targets.json');
const DEFAULT_EAS_CONFIG_PATH = path.resolve(SCRIPT_DIRECTORY, '..', 'eas.json');
const DEFAULT_MINIMUM_VALIDITY_DAYS = 60;
const CREDENTIAL_SETUP_COMMAND =
  'npx eas-cli@21.0.2 credentials:configure-build --platform ios --profile production';

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

function requiredString(value, label, errors) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string.`);
    return null;
  }
  return value.trim();
}

function validateExpiry(value, label, now, minimumValidityDays, errors) {
  const rawValue = requiredString(value, `${label} expiration`, errors);
  if (!rawValue) return;

  const expiration = new Date(rawValue);
  if (!Number.isFinite(expiration.getTime())) {
    errors.push(`${label} expiration "${rawValue}" is not a valid ISO-8601 date.`);
    return;
  }

  const remainingMs = expiration.getTime() - now.getTime();
  const remainingDays = remainingMs / (24 * 60 * 60 * 1000);
  if (remainingDays < minimumValidityDays) {
    errors.push(
      `${label} expires at ${expiration.toISOString()} (${Math.floor(remainingDays)} days remaining); ` +
        `at least ${minimumValidityDays} days are required.`
    );
  }
}

function effectiveMainEntitlements(iosConfig) {
  const entitlements = isRecord(iosConfig.entitlements) ? { ...iosConfig.entitlements } : {};
  if (iosConfig.usesAppleSignIn === true && entitlements['com.apple.developer.applesignin'] === undefined) {
    entitlements['com.apple.developer.applesignin'] = ['Default'];
  }
  return entitlements;
}

function resolveConfiguredTargets(resolvedConfig, errors) {
  const appConfig = resolvedConfig?.appConfig ?? resolvedConfig?.expo ?? resolvedConfig;
  if (!isRecord(appConfig)) {
    errors.push('Resolved EAS config does not contain an appConfig object.');
    return [];
  }

  const iosConfig = appConfig.ios;
  if (!isRecord(iosConfig)) {
    errors.push('Resolved EAS config does not contain appConfig.ios.');
    return [];
  }

  const mainTargetName = requiredString(appConfig.name, 'Resolved main target name', errors);
  const mainBundleIdentifier = requiredString(
    iosConfig.bundleIdentifier,
    'Resolved main bundle identifier',
    errors
  );
  if (!mainTargetName || !mainBundleIdentifier) return [];

  const rawExtensions =
    appConfig.extra?.eas?.build?.experimental?.ios?.appExtensions ?? [];
  if (!Array.isArray(rawExtensions)) {
    errors.push('Resolved EAS appExtensions must be an array.');
    return [];
  }

  const targets = [
    {
      targetName: mainTargetName,
      bundleIdentifier: mainBundleIdentifier,
      parentBundleIdentifier: null,
      entitlements: effectiveMainEntitlements(iosConfig),
    },
  ];

  for (const [index, extension] of rawExtensions.entries()) {
    if (!isRecord(extension)) {
      errors.push(`Resolved appExtensions[${index}] must be an object.`);
      continue;
    }
    const targetName = requiredString(
      extension.targetName,
      `Resolved appExtensions[${index}].targetName`,
      errors
    );
    const bundleIdentifier = requiredString(
      extension.bundleIdentifier,
      `Resolved appExtensions[${index}].bundleIdentifier`,
      errors
    );
    if (!targetName || !bundleIdentifier) continue;
    if (!isRecord(extension.entitlements ?? {})) {
      errors.push(`Resolved target "${targetName}" entitlements must be an object.`);
      continue;
    }
    targets.push({
      targetName,
      bundleIdentifier,
      parentBundleIdentifier: mainBundleIdentifier,
      entitlements: extension.entitlements ?? {},
    });
  }

  return targets;
}

function validateUniqueTargets(targets, sourceLabel, errors) {
  const targetNames = new Set();
  const bundleIdentifiers = new Set();
  for (const target of targets) {
    if (targetNames.has(target.targetName)) {
      errors.push(`${sourceLabel} repeats target name "${target.targetName}".`);
    }
    targetNames.add(target.targetName);

    if (bundleIdentifiers.has(target.bundleIdentifier)) {
      errors.push(`${sourceLabel} repeats bundle identifier "${target.bundleIdentifier}".`);
    }
    bundleIdentifiers.add(target.bundleIdentifier);
  }
}

export function validateIosSigningTargets({
  resolvedConfig,
  introspectedConfig,
  manifest,
  now = new Date(),
}) {
  const errors = [];
  let needsCredentialSetup = false;

  if (!isRecord(manifest)) {
    return { errors: ['Signing manifest must be a JSON object.'], targets: [] };
  }
  if (manifest.schemaVersion !== 1) {
    errors.push(`Unsupported signing manifest schemaVersion "${manifest.schemaVersion}"; expected 1.`);
  }

  const minimumValidityDays = manifest.minimumValidityDays;
  if (!Number.isInteger(minimumValidityDays) || minimumValidityDays < 1) {
    errors.push('minimumValidityDays must be a positive integer.');
  }
  const validityDays =
    Number.isInteger(minimumValidityDays) && minimumValidityDays > 0
      ? minimumValidityDays
      : DEFAULT_MINIMUM_VALIDITY_DAYS;

  const certificate = manifest.certificate;
  if (!isRecord(certificate)) {
    errors.push('Signing manifest certificate must be an object.');
  } else {
    const serialNumber = requiredString(
      certificate.serialNumber,
      'Distribution certificate serialNumber',
      errors
    );
    if (serialNumber && !/^[A-F0-9]+$/i.test(serialNumber)) {
      errors.push('Distribution certificate serialNumber must contain only hexadecimal characters.');
    }
    const teamIdentifier = requiredString(
      certificate.teamIdentifier,
      'Apple teamIdentifier',
      errors
    );
    if (teamIdentifier && !/^[A-Z0-9]{10}$/.test(teamIdentifier)) {
      errors.push('Apple teamIdentifier must be a 10-character uppercase identifier.');
    }
    requiredString(certificate.teamName, 'Apple teamName', errors);
    validateExpiry(
      certificate.expiresAt,
      'Distribution certificate',
      now,
      validityDays,
      errors
    );
  }

  if (!Array.isArray(manifest.targets) || manifest.targets.length === 0) {
    errors.push('Signing manifest targets must be a non-empty array.');
    return { errors, targets: [] };
  }

  const expectedTargets = [];
  for (const [index, target] of manifest.targets.entries()) {
    if (!isRecord(target)) {
      errors.push(`Signing manifest targets[${index}] must be an object.`);
      continue;
    }
    const targetName = requiredString(target.targetName, `targets[${index}].targetName`, errors);
    const bundleIdentifier = requiredString(
      target.bundleIdentifier,
      `targets[${index}].bundleIdentifier`,
      errors
    );
    if (!targetName || !bundleIdentifier) continue;

    if (target.parentBundleIdentifier !== null) {
      const parentBundleIdentifier = requiredString(
        target.parentBundleIdentifier,
        `Target "${targetName}" parentBundleIdentifier`,
        errors
      );
      if (parentBundleIdentifier && !bundleIdentifier.startsWith(`${parentBundleIdentifier}.`)) {
        errors.push(
          `Target "${targetName}" bundle identifier "${bundleIdentifier}" must be nested under ` +
            `"${parentBundleIdentifier}".`
        );
      }
    }

    if (!isRecord(target.entitlements)) {
      errors.push(`Target "${targetName}" entitlements must be an object.`);
    }

    const targetCertificateSerial = requiredString(
      target.certificateSerialNumber,
      `Target "${targetName}" certificateSerialNumber`,
      errors
    );
    if (
      targetCertificateSerial &&
      isRecord(certificate) &&
      targetCertificateSerial !== certificate.serialNumber
    ) {
      errors.push(
        `Target "${targetName}" references certificate ${targetCertificateSerial}, but the shared ` +
          `certificate is ${certificate.serialNumber}.`
      );
    }

    if (!isRecord(target.profile)) {
      errors.push(`Target "${targetName}" profile must be an object.`);
      needsCredentialSetup = true;
    } else {
      const profileId = requiredString(
        target.profile.developerPortalId,
        `Target "${targetName}" provisioning profile developerPortalId`,
        errors
      );
      if (profileId && !/^[A-Z0-9]+$/i.test(profileId)) {
        errors.push(
          `Target "${targetName}" provisioning profile developerPortalId contains invalid characters.`
        );
      }
      const profileErrorCount = errors.length;
      validateExpiry(
        target.profile.expiresAt,
        `Target "${targetName}" provisioning profile`,
        now,
        validityDays,
        errors
      );
      if (!profileId || errors.length > profileErrorCount) needsCredentialSetup = true;
    }

    expectedTargets.push(target);
  }

  validateUniqueTargets(expectedTargets, 'Signing manifest', errors);

  const easTargets = resolveConfiguredTargets(resolvedConfig, errors);
  validateUniqueTargets(easTargets, 'Resolved EAS config', errors);
  const configuredTargets = introspectedConfig
    ? resolveConfiguredTargets(introspectedConfig, errors)
    : easTargets;
  if (introspectedConfig) {
    validateUniqueTargets(configuredTargets, 'Introspected Expo config', errors);
    const easByName = new Map(easTargets.map((target) => [target.targetName, target]));
    const introspectedByName = new Map(
      configuredTargets.map((target) => [target.targetName, target])
    );
    for (const target of easTargets) {
      const introspected = introspectedByName.get(target.targetName);
      if (!introspected) {
        errors.push(
          `Production EAS config target "${target.targetName}" is missing from Expo introspection.`
        );
        continue;
      }
      if (
        introspected.bundleIdentifier !== target.bundleIdentifier ||
        introspected.parentBundleIdentifier !== target.parentBundleIdentifier
      ) {
        errors.push(
          `Production EAS config and Expo introspection disagree for target ` +
            `"${target.targetName}".`
        );
      }
    }
    for (const target of configuredTargets) {
      if (!easByName.has(target.targetName)) {
        errors.push(
          `Expo introspection contains target "${target.targetName}" that is missing from the ` +
            'production EAS config.'
        );
      }
    }
  }

  const expectedByName = new Map(expectedTargets.map((target) => [target.targetName, target]));
  const configuredByName = new Map(configuredTargets.map((target) => [target.targetName, target]));

  for (const target of expectedTargets) {
    const configuredTarget = configuredByName.get(target.targetName);
    if (!configuredTarget) {
      errors.push(`Resolved EAS config is missing expected iOS target "${target.targetName}".`);
      continue;
    }
    if (configuredTarget.bundleIdentifier !== target.bundleIdentifier) {
      errors.push(
        `Target "${target.targetName}" bundle identifier drifted: expected ` +
          `"${target.bundleIdentifier}", resolved "${configuredTarget.bundleIdentifier}".`
      );
    }
    if (configuredTarget.parentBundleIdentifier !== target.parentBundleIdentifier) {
      errors.push(
        `Target "${target.targetName}" parent bundle drifted: expected ` +
          `${JSON.stringify(target.parentBundleIdentifier)}, resolved ` +
          `${JSON.stringify(configuredTarget.parentBundleIdentifier)}.`
      );
    }
    if (printable(configuredTarget.entitlements) !== printable(target.entitlements)) {
      errors.push(
        `Target "${target.targetName}" entitlement drift: expected ${printable(
          target.entitlements
        )}, resolved ${printable(configuredTarget.entitlements)}.`
      );
    }
  }

  for (const target of configuredTargets) {
    if (!expectedByName.has(target.targetName)) {
      errors.push(
        `Resolved EAS config contains untracked iOS target "${target.targetName}" ` +
          `(${target.bundleIdentifier}). Add its signing metadata to ios-signing-targets.json ` +
          'only after its Apple/EAS credentials are provisioned.'
      );
    }
  }

  if (needsCredentialSetup) {
    errors.push(
      `Provision or renew every target with \`${CREDENTIAL_SETUP_COMMAND}\`, then copy each ` +
        'profile Developer Portal ID and expiration into ios-signing-targets.json before rerunning CI.'
    );
  }

  return { errors, targets: configuredTargets };
}

export function validateSigningCanaryProfile(easConfig) {
  const errors = [];
  const production = easConfig?.build?.production;
  const canary = easConfig?.build?.['signing-canary'];
  if (!isRecord(production)) {
    return ['eas.json must define build.production.'];
  }
  if (production.credentialsSource !== 'remote') {
    errors.push('build.production.credentialsSource must remain "remote".');
  }
  if (production.environment !== 'production') {
    errors.push('build.production.environment must remain "production".');
  }
  if (production.autoIncrement !== true) {
    errors.push('build.production.autoIncrement must remain true.');
  }
  if (!isRecord(canary)) {
    errors.push('eas.json must define build.signing-canary.');
    return errors;
  }
  if (canary.extends !== 'production') {
    errors.push('build.signing-canary must extend "production".');
  }
  if (canary.autoIncrement !== false) {
    errors.push('build.signing-canary.autoIncrement must remain false.');
  }
  const unexpectedKeys = Object.keys(canary).filter(
    (key) => key !== 'extends' && key !== 'autoIncrement'
  );
  if (unexpectedKeys.length > 0) {
    errors.push(
      `build.signing-canary must inherit the production signing path without overrides; ` +
        `remove: ${unexpectedKeys.sort().join(', ')}.`
    );
  }
  return errors;
}

async function readJson(filePath, label) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} at ${filePath} is not valid JSON: ${error.message}`);
  }
}

function sanitizedProfileEnvironment(buildProfile) {
  return isRecord(buildProfile?.env)
    ? Object.fromEntries(
        Object.entries(buildProfile.env).filter(([, value]) => typeof value === 'string')
      )
    : {};
}

function runExpoIntrospection(profileEnvironment) {
  const expoExecutable = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'expo.cmd' : 'expo'
  );
  const result = spawnSync(
    expoExecutable,
    ['config', '--type', 'introspect', '--json'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...profileEnvironment,
        NODE_ENV: 'production',
        EAS_BUILD_PLATFORM: 'ios',
        EAS_BUILD_PROFILE: 'production',
      },
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    }
  );
  if (result.error) {
    throw new Error(`Unable to introspect Expo config: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `Expo config introspection exited with status ${result.status}: ${result.stderr.trim()}`
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Expo config introspection did not return valid JSON: ${error.message}`);
  }
}

function introspectWithProductionEnvironment(resolvedConfig) {
  if (!isRecord(resolvedConfig?.buildProfile) || !isRecord(resolvedConfig?.appConfig)) {
    return null;
  }
  return runExpoIntrospection(sanitizedProfileEnvironment(resolvedConfig.buildProfile));
}

async function resolveLocalProductionConfig() {
  const easConfig = await readJson(DEFAULT_EAS_CONFIG_PATH, 'EAS config');
  const buildProfile = easConfig?.build?.production;
  if (!isRecord(buildProfile)) {
    throw new Error(`${DEFAULT_EAS_CONFIG_PATH} does not define build.production.`);
  }
  return {
    appConfig: runExpoIntrospection(sanitizedProfileEnvironment(buildProfile)),
    buildProfile,
  };
}

async function main() {
  const resolvedConfigArgument = process.argv[2];
  if (!resolvedConfigArgument) {
    console.error(
      'Usage: node scripts/validate-ios-signing-targets.mjs ' +
        '<resolved-eas-config.json|--local-production> [manifest.json]'
    );
    process.exitCode = 2;
    return;
  }

  const manifestPath = process.argv[3]
    ? path.resolve(process.cwd(), process.argv[3])
    : DEFAULT_MANIFEST_PATH;
  const [resolvedConfig, manifest, easConfig] = await Promise.all([
    resolvedConfigArgument === '--local-production'
      ? resolveLocalProductionConfig()
      : readJson(
          path.resolve(process.cwd(), resolvedConfigArgument),
          'resolved EAS config'
        ),
    readJson(manifestPath, 'iOS signing manifest'),
    readJson(DEFAULT_EAS_CONFIG_PATH, 'EAS config'),
  ]);
  const introspectedConfig = introspectWithProductionEnvironment(resolvedConfig);

  const result = validateIosSigningTargets({
    resolvedConfig,
    introspectedConfig,
    manifest,
  });
  result.errors.push(...validateSigningCanaryProfile(easConfig));
  if (result.errors.length > 0) {
    console.error('iOS signing validation failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `iOS signing inventory is valid for ${result.targets.length} targets with at least ` +
      `${manifest.minimumValidityDays} days of credential validity remaining.`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`iOS signing validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
