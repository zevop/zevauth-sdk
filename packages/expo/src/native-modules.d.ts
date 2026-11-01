/*
 * The slice of React Native and Expo this package uses, declared here so
 * the workspace type-checks without installing a mobile toolchain. Every
 * name matches the real packages' own types, which an app installs and
 * which take over in its build. Not emitted: `.d.ts` files in `src` are
 * inputs only.
 */

declare module 'react-native' {
  import type { ComponentType, ReactNode } from 'react';

  export interface ViewStyle { [key: string]: unknown }
  export interface TextStyle extends ViewStyle {}
  export type StyleProp<T> = T | null | undefined | false | ReadonlyArray<StyleProp<T>>;

  interface Base {
    style?: StyleProp<ViewStyle | TextStyle>;
    testID?: string;
    accessibilityLabel?: string;
    accessibilityRole?: string;
    accessibilityState?: { disabled?: boolean; selected?: boolean; checked?: boolean; busy?: boolean };
    accessible?: boolean;
    children?: ReactNode;
  }

  export const View: ComponentType<Base & { pointerEvents?: string }>;
  export const Text: ComponentType<Base & { selectable?: boolean; numberOfLines?: number }>;
  export const ScrollView: ComponentType<Base & { contentContainerStyle?: StyleProp<ViewStyle>; keyboardShouldPersistTaps?: 'always' | 'handled' | 'never' }>;
  export const Image: ComponentType<Base & { source: { uri: string }; resizeMode?: string }>;
  export const ActivityIndicator: ComponentType<Base & { color?: string; size?: 'small' | 'large' }>;
  export const KeyboardAvoidingView: ComponentType<Base & { behavior?: 'height' | 'position' | 'padding' }>;
  export const Pressable: ComponentType<
    Omit<Base, 'style'> & {
      onPress?: () => void;
      disabled?: boolean;
      hitSlop?: number;
      style?: StyleProp<ViewStyle | TextStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle | TextStyle>);
    }
  >;
  export const TextInput: ComponentType<
    Base & {
      value?: string;
      onChangeText?: (text: string) => void;
      onSubmitEditing?: () => void;
      placeholder?: string;
      placeholderTextColor?: string;
      secureTextEntry?: boolean;
      autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
      autoCorrect?: boolean;
      autoComplete?: string;
      textContentType?: string;
      keyboardType?: string;
      inputMode?: string;
      returnKeyType?: string;
      editable?: boolean;
      maxLength?: number;
      autoFocus?: boolean;
    }
  >;
  export const Modal: ComponentType<
    Base & { visible: boolean; transparent?: boolean; animationType?: 'none' | 'slide' | 'fade'; onRequestClose?: () => void }
  >;

  export const Platform: { OS: 'ios' | 'android' | 'web' | string; select<T>(options: { ios?: T; android?: T; default?: T }): T | undefined };
  export function useColorScheme(): 'light' | 'dark' | null | undefined;

  export const Linking: {
    getInitialURL(): Promise<string | null>;
    addEventListener(type: 'url', handler: (event: { url: string }) => void): { remove(): void };
    openURL(url: string): Promise<void>;
    canOpenURL(url: string): Promise<boolean>;
  };
  export const AppState: {
    currentState: string;
    addEventListener(type: 'change', handler: (state: string) => void): { remove(): void };
  };
  export const Share: {
    share(content: { message: string; title?: string }): Promise<unknown>;
  };
}

declare module 'expo-secure-store' {
  export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: number;
  export interface SecureStoreOptions { keychainAccessible?: number }
  export function getItemAsync(key: string, options?: SecureStoreOptions): Promise<string | null>;
  export function setItemAsync(key: string, value: string, options?: SecureStoreOptions): Promise<void>;
  export function deleteItemAsync(key: string, options?: SecureStoreOptions): Promise<void>;
}

declare module 'expo-crypto' {
  export enum CryptoDigestAlgorithm { SHA256 = 'SHA-256' }
  export function getRandomValues<T extends Uint8Array>(array: T): T;
  export function digest(algorithm: CryptoDigestAlgorithm, data: Uint8Array): Promise<ArrayBuffer>;
}

declare module 'expo-web-browser' {
  export type WebBrowserAuthSessionResult =
    | { type: 'success'; url: string }
    | { type: 'cancel' | 'dismiss' | 'locked' | 'opened' };
  export interface AuthSessionOpenOptions { preferEphemeralSession?: boolean; showInRecents?: boolean }
  export function openAuthSessionAsync(
    url: string,
    redirectUrl?: string | null,
    options?: AuthSessionOpenOptions,
  ): Promise<WebBrowserAuthSessionResult>;
  export function dismissAuthSession(): void;
  export function maybeCompleteAuthSession(): { type: 'success' | 'failed'; message?: string };
}
