// Metro config. The app ships to iOS/Android only; `expo start --web` is a
// DEVELOPMENT PREVIEW convenience (fast hot-reload in a browser), not a shipping
// target — there is no `web` block in app.config.ts.
//
// The one web-specific fix: @supabase/supabase-js optionally imports
// `@opentelemetry/api` (for tracing) which is not a real dependency and cannot be
// resolved by the web bundler. We map just that one module to an empty stub. This
// resolver is surgical (only that module name) and harmless on native, where the
// import is never reached.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const emptyModule = require.resolve('./metro-empty-module.js');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@opentelemetry/api') {
    return { type: 'sourceFile', filePath: emptyModule };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
