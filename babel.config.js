// Babel config for Expo. The babel-preset-expo handles RN + TS transform.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
