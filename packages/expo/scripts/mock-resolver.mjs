const MOCKS = {
  'react-native': './mocks/react-native.mjs',
  'expo-secure-store': './mocks/expo-secure-store.mjs',
  'expo-crypto': './mocks/expo-crypto.mjs',
  'expo-web-browser': './mocks/expo-web-browser.mjs',
};

export async function resolve(specifier, context, next) {
  if (specifier in MOCKS) {
    return { url: new URL(MOCKS[specifier], import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
