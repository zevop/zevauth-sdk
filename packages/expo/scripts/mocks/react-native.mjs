import React from 'react';

const host = (name) => {
  const C = (props) => React.createElement(name, props, props.children);
  C.displayName = name;
  return C;
};

export const View = host('View');
export const Text = host('Text');
export const ScrollView = host('ScrollView');
export const Image = host('Image');
export const ActivityIndicator = host('ActivityIndicator');
export const KeyboardAvoidingView = host('KeyboardAvoidingView');
export const TextInput = host('TextInput');
export const Pressable = (props) =>
  React.createElement(
    'Pressable',
    { ...props, style: typeof props.style === 'function' ? props.style({ pressed: false }) : props.style },
    props.children,
  );
export const Modal = (props) => (props.visible ? React.createElement('Modal', props, props.children) : null);

export const Platform = { OS: 'ios', select: (o) => o.ios ?? o.default };

export const mock = {
  colorScheme: 'light',
  initialUrl: null,
  urlListeners: new Set(),
  appStateListeners: new Set(),
  opened: [],
  canOpen: true,
  shared: [],
};

export function useColorScheme() {
  return mock.colorScheme;
}

export const Linking = {
  getInitialURL: async () => mock.initialUrl,
  addEventListener: (_type, handler) => {
    mock.urlListeners.add(handler);
    return { remove: () => mock.urlListeners.delete(handler) };
  },
  openURL: async (url) => {
    mock.opened.push(url);
  },
  canOpenURL: async () => mock.canOpen,
};

export const AppState = {
  currentState: 'active',
  addEventListener: (_type, handler) => {
    mock.appStateListeners.add(handler);
    return { remove: () => mock.appStateListeners.delete(handler) };
  },
};

export const Share = {
  share: async (content) => {
    mock.shared.push(content);
  },
};
