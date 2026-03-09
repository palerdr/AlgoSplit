const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add STL files as asset extensions for 3D body model
config.resolver.assetExts.push('stl');

module.exports = config;
