const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const DEFAULT_TARGET_NAME = 'AlgoSplitLiveActivity';

/**
 * Voltra generates its widget entry point during prebuild. This dangerous mod
 * runs after Voltra's generator and replaces that entry point with AlgoSplit's
 * deadline-aware Live Activity widget.
 */
function withRestLiveActivity(config, options = {}) {
  const targetName = options.targetName || DEFAULT_TARGET_NAME;

  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const projectRoot = modConfig.modRequest.projectRoot;
      const platformProjectRoot = modConfig.modRequest.platformProjectRoot;
      const templatePath = path.join(
        projectRoot,
        'modules',
        'rest-completion-alert',
        'widget',
        'VoltraWidgetBundle.swift'
      );
      const generatedPath = path.join(
        platformProjectRoot,
        targetName,
        'VoltraWidgetBundle.swift'
      );

      if (!fs.existsSync(templatePath)) {
        throw new Error(`Rest Live Activity template not found: ${templatePath}`);
      }
      if (!fs.existsSync(path.dirname(generatedPath))) {
        throw new Error(`Voltra widget target not found: ${path.dirname(generatedPath)}`);
      }

      fs.copyFileSync(templatePath, generatedPath);
      return modConfig;
    },
  ]);
}

module.exports = withRestLiveActivity;
