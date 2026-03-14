const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add 3D body model assets for the dashboard visualizer.
config.resolver.assetExts.push('stl', 'glb');

module.exports = config;
