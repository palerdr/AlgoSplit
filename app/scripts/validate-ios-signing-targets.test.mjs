import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateIosSigningTargets,
  validateSigningCanaryProfile,
} from './validate-ios-signing-targets.mjs';

const NOW = new Date('2026-07-20T16:32:28.000Z');

function resolvedConfig(extensionOverrides = {}) {
  return {
    appConfig: {
      name: 'AlgoSplit',
      ios: {
        bundleIdentifier: 'com.algosplit.app',
        usesAppleSignIn: true,
      },
      extra: {
        eas: {
          build: {
            experimental: {
              ios: {
                appExtensions: [
                  {
                    targetName: 'AlgoSplitLiveActivity',
                    bundleIdentifier: 'com.algosplit.app.AlgoSplitLiveActivity',
                    entitlements: {},
                    ...extensionOverrides,
                  },
                ],
              },
            },
          },
        },
      },
    },
  };
}

function manifest(overrides = {}) {
  const certificateSerialNumber = '26D0FAC8CDD0036DC2DB2BCAF96B7A12';
  return {
    schemaVersion: 1,
    lastVerifiedAt: NOW.toISOString(),
    minimumValidityDays: 60,
    certificate: {
      serialNumber: certificateSerialNumber,
      expiresAt: '2027-07-17T01:05:32.000Z',
      teamIdentifier: 'UL74B9H48Y',
      teamName: 'Andre Boufama (Individual)',
    },
    targets: [
      {
        targetName: 'AlgoSplit',
        bundleIdentifier: 'com.algosplit.app',
        parentBundleIdentifier: null,
        entitlements: { 'com.apple.developer.applesignin': ['Default'] },
        certificateSerialNumber,
        profile: {
          developerPortalId: 'XC7586P8FX',
          expiresAt: '2027-07-17T01:05:32.000Z',
        },
      },
      {
        targetName: 'AlgoSplitLiveActivity',
        bundleIdentifier: 'com.algosplit.app.AlgoSplitLiveActivity',
        parentBundleIdentifier: 'com.algosplit.app',
        entitlements: {},
        certificateSerialNumber,
        profile: {
          developerPortalId: 'M8Q34U9KC2',
          expiresAt: '2027-07-17T01:05:32.000Z',
        },
      },
    ],
    ...overrides,
  };
}

test('accepts the exact provisioned target and entitlement inventory', () => {
  const result = validateIosSigningTargets({
    resolvedConfig: resolvedConfig(),
    manifest: manifest(),
    now: NOW,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.targets.length, 2);
});

test('rejects a newly generated extension until its signing metadata is reviewed', () => {
  const config = resolvedConfig();
  config.appConfig.extra.eas.build.experimental.ios.appExtensions.push({
    targetName: 'FutureWidget',
    bundleIdentifier: 'com.algosplit.app.FutureWidget',
    entitlements: {},
  });

  const result = validateIosSigningTargets({
    resolvedConfig: config,
    manifest: manifest(),
    now: NOW,
  });

  assert.ok(result.errors.some((error) => error.includes('untracked iOS target "FutureWidget"')));
});

test('uses native introspection for entitlements while retaining production target identity', () => {
  const groupEntitlement = {
    'com.apple.security.application-groups': ['group.com.algosplit.app'],
  };
  const expectedManifest = manifest();
  expectedManifest.targets[1].entitlements = groupEntitlement;

  const result = validateIosSigningTargets({
    resolvedConfig: resolvedConfig(),
    introspectedConfig: resolvedConfig({ entitlements: groupEntitlement }),
    manifest: expectedManifest,
    now: NOW,
  });

  assert.deepEqual(result.errors, []);
});

test('rejects identity drift between production resolution and native introspection', () => {
  const result = validateIosSigningTargets({
    resolvedConfig: resolvedConfig(),
    introspectedConfig: resolvedConfig({
      bundleIdentifier: 'com.algosplit.app.OtherLiveActivity',
    }),
    manifest: manifest(),
    now: NOW,
  });

  assert.ok(result.errors.some((error) => error.includes('disagree for target')));
});

test('rejects entitlement drift that requires profile regeneration', () => {
  const result = validateIosSigningTargets({
    resolvedConfig: resolvedConfig({ entitlements: { 'com.apple.security.application-groups': ['group.algosplit'] } }),
    manifest: manifest(),
    now: NOW,
  });

  assert.ok(result.errors.some((error) => error.includes('entitlement drift')));
});

test('fails before a provisioning profile reaches the renewal window', () => {
  const expiringManifest = manifest();
  expiringManifest.targets[1].profile.expiresAt = '2026-08-01T00:00:00.000Z';

  const result = validateIosSigningTargets({
    resolvedConfig: resolvedConfig(),
    manifest: expiringManifest,
    now: NOW,
  });

  assert.ok(result.errors.some((error) => error.includes('at least 60 days are required')));
  assert.ok(result.errors.some((error) => error.includes('credentials:configure-build')));
});

test('rejects a target whose provisioning profile was never bootstrapped', () => {
  const missingProfileManifest = manifest();
  missingProfileManifest.targets[1].profile = {
    developerPortalId: null,
    expiresAt: null,
  };

  const result = validateIosSigningTargets({
    resolvedConfig: resolvedConfig(),
    manifest: missingProfileManifest,
    now: NOW,
  });

  assert.ok(result.errors.some((error) => error.includes('developerPortalId')));
  assert.ok(result.errors.some((error) => error.includes('credentials:configure-build')));
});

test('requires the signing canary to inherit production without incrementing', () => {
  assert.deepEqual(
    validateSigningCanaryProfile({
      build: {
        production: {
          credentialsSource: 'remote',
          environment: 'production',
          autoIncrement: true,
        },
        'signing-canary': { extends: 'production', autoIncrement: false },
      },
    }),
    []
  );
});

test('rejects signing canary drift that could consume or exercise the wrong credentials', () => {
  const errors = validateSigningCanaryProfile({
    build: {
      production: {
        credentialsSource: 'local',
        environment: 'preview',
        autoIncrement: false,
      },
      'signing-canary': {
        extends: 'preview',
        autoIncrement: true,
        distribution: 'internal',
      },
    },
  });

  assert.ok(errors.some((error) => error.includes('credentialsSource')));
  assert.ok(errors.some((error) => error.includes('must extend')));
  assert.ok(errors.some((error) => error.includes('autoIncrement')));
  assert.ok(errors.some((error) => error.includes('remove: distribution')));
});
