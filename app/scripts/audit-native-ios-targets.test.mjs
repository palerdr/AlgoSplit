import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareNativeSigningTargets,
  extractReleaseTargetDescriptors,
  isSignableProductType,
  trackedNativeIosProjectError,
} from './audit-native-ios-targets.mjs';

function projectFixture() {
  const nativeTargets = {
    APP: {
      isa: 'PBXNativeTarget',
      name: 'AlgoSplit',
      productType: '"com.apple.product-type.application"',
      buildConfigurationList: 'APP_CONFIGS',
    },
    APP_comment: 'AlgoSplit',
    EXTENSION: {
      isa: 'PBXNativeTarget',
      name: 'AlgoSplitLiveActivity',
      productType: '"com.apple.product-type.app-extension"',
      buildConfigurationList: 'EXTENSION_CONFIGS',
    },
    EXTENSION_comment: 'AlgoSplitLiveActivity',
    TESTS: {
      isa: 'PBXNativeTarget',
      name: 'AlgoSplitTests',
      productType: '"com.apple.product-type.bundle.unit-test"',
      buildConfigurationList: 'TEST_CONFIGS',
    },
    TESTS_comment: 'AlgoSplitTests',
  };
  const configurationLists = {
    PROJECT_CONFIGS: {
      isa: 'XCConfigurationList',
      buildConfigurations: [{ value: 'PROJECT_RELEASE', comment: 'Release' }],
    },
    PROJECT_CONFIGS_comment: 'Project configs',
    APP_CONFIGS: {
      isa: 'XCConfigurationList',
      buildConfigurations: [{ value: 'APP_RELEASE', comment: 'Release' }],
    },
    APP_CONFIGS_comment: 'App configs',
    EXTENSION_CONFIGS: {
      isa: 'XCConfigurationList',
      buildConfigurations: [{ value: 'EXTENSION_RELEASE', comment: 'Release' }],
    },
    EXTENSION_CONFIGS_comment: 'Extension configs',
    TEST_CONFIGS: {
      isa: 'XCConfigurationList',
      buildConfigurations: [{ value: 'TEST_RELEASE', comment: 'Release' }],
    },
    TEST_CONFIGS_comment: 'Test configs',
  };
  const buildConfigurations = {
    PROJECT_RELEASE: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: { PRODUCT_NAME: '"$(TARGET_NAME)"' },
    },
    PROJECT_RELEASE_comment: 'Release',
    APP_RELEASE: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER: '"com.algosplit.app"',
        CODE_SIGN_ENTITLEMENTS: 'AlgoSplit/AlgoSplit.entitlements',
      },
    },
    APP_RELEASE_comment: 'Release',
    EXTENSION_RELEASE: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: {
        PRODUCT_BUNDLE_IDENTIFIER: '"com.algosplit.app.$(TARGET_NAME)"',
        CODE_SIGN_ENTITLEMENTS: '"$(TARGET_NAME)/$(TARGET_NAME).entitlements"',
      },
    },
    EXTENSION_RELEASE_comment: 'Release',
    TEST_RELEASE: {
      isa: 'XCBuildConfiguration',
      name: 'Release',
      buildSettings: { PRODUCT_BUNDLE_IDENTIFIER: 'com.algosplit.app.tests' },
    },
    TEST_RELEASE_comment: 'Release',
  };

  return {
    pbxNativeTargetSection: () => nativeTargets,
    pbxProjectSection: () => ({
      PROJECT: { isa: 'PBXProject', buildConfigurationList: 'PROJECT_CONFIGS' },
      PROJECT_comment: 'Project object',
    }),
    pbxXCConfigurationList: () => configurationLists,
    pbxXCBuildConfigurationSection: () => buildConfigurations,
  };
}

const nativeTargets = () => [
  {
    targetName: 'AlgoSplit',
    productType: 'com.apple.product-type.application',
    bundleIdentifier: 'com.algosplit.app',
    entitlements: { 'com.apple.developer.applesignin': ['Default'] },
  },
  {
    targetName: 'AlgoSplitLiveActivity',
    productType: 'com.apple.product-type.app-extension',
    bundleIdentifier: 'com.algosplit.app.AlgoSplitLiveActivity',
    entitlements: {},
  },
];

const manifestTargets = () => [
  {
    targetName: 'AlgoSplitLiveActivity',
    bundleIdentifier: 'com.algosplit.app.AlgoSplitLiveActivity',
    parentBundleIdentifier: 'com.algosplit.app',
    entitlements: {},
  },
  {
    targetName: 'AlgoSplit',
    bundleIdentifier: 'com.algosplit.app',
    parentBundleIdentifier: null,
    entitlements: { 'com.apple.developer.applesignin': ['Default'] },
  },
];

test('recognizes signable application and extension product types only', () => {
  assert.equal(isSignableProductType('com.apple.product-type.application'), true);
  assert.equal(
    isSignableProductType('com.apple.product-type.application.on-demand-install-capable'),
    true
  );
  assert.equal(isSignableProductType('com.apple.product-type.app-extension'), true);
  assert.equal(isSignableProductType('com.apple.product-type.watchkit2-extension'), true);
  assert.equal(isSignableProductType('com.apple.product-type.framework'), false);
  assert.equal(isSignableProductType('com.apple.product-type.bundle.unit-test'), false);
});

test('extracts Release identifiers and entitlement paths while ignoring tests', () => {
  const result = extractReleaseTargetDescriptors(projectFixture(), {
    projectDirectory: '/tmp/generated/ios',
  });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.targets.map(({ projectDirectory: _projectDirectory, ...target }) => target),
    [
      {
        targetName: 'AlgoSplit',
        productType: 'com.apple.product-type.application',
        bundleIdentifier: 'com.algosplit.app',
        entitlementsPath: 'AlgoSplit/AlgoSplit.entitlements',
      },
      {
        targetName: 'AlgoSplitLiveActivity',
        productType: 'com.apple.product-type.app-extension',
        bundleIdentifier: 'com.algosplit.app.AlgoSplitLiveActivity',
        entitlementsPath:
          'AlgoSplitLiveActivity/AlgoSplitLiveActivity.entitlements',
      },
    ]
  );
});

test('accepts an exact target inventory independent of target order', () => {
  assert.deepEqual(compareNativeSigningTargets(nativeTargets(), manifestTargets()), []);
});

test('reports extra and missing signable native targets', () => {
  const actual = nativeTargets();
  actual.shift();
  actual.push({
    targetName: 'UnexpectedWidget',
    productType: 'com.apple.product-type.app-extension',
    bundleIdentifier: 'com.algosplit.app.UnexpectedWidget',
    entitlements: {},
  });

  const errors = compareNativeSigningTargets(actual, manifestTargets());
  assert.ok(errors.some((error) => error.includes('missing manifest target "AlgoSplit"')));
  assert.ok(errors.some((error) => error.includes('untracked signable target "UnexpectedWidget"')));
});

test('reports bundle identifier, product type, and entitlement drift', () => {
  const actual = nativeTargets();
  actual[1] = {
    ...actual[1],
    productType: 'com.apple.product-type.application',
    bundleIdentifier: 'com.algosplit.app.Wrong',
    entitlements: { 'com.apple.security.application-groups': ['group.algosplit'] },
  };

  const errors = compareNativeSigningTargets(actual, manifestTargets());
  assert.ok(errors.some((error) => error.includes('bundle identifier drift')));
  assert.ok(errors.some((error) => error.includes('product type drift')));
  assert.ok(errors.some((error) => error.includes('entitlement drift')));
});

test('fails closed when a signable target has no Release configuration', () => {
  const project = projectFixture();
  project.pbxXCConfigurationList().EXTENSION_CONFIGS.buildConfigurations = [];

  const result = extractReleaseTargetDescriptors(project, {
    projectDirectory: '/tmp/generated/ios',
  });
  assert.ok(result.errors.some((error) => error.includes('has no auditable Release configuration')));
});

test('fails closed instead of auditing the wrong project when native iOS files are tracked', () => {
  assert.equal(trackedNativeIosProjectError([]), null);
  const error = trackedNativeIosProjectError([
    'ios/AlgoSplit.xcodeproj/project.pbxproj',
    'ios/AlgoSplit/Info.plist',
  ]);
  assert.match(error, /Tracked native iOS files detected/);
  assert.match(error, /committed Xcode project/);
});
