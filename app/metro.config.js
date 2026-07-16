const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 3D body model for the muscle heatmap.
config.resolver.assetExts.push('glb');

module.exports = config;
