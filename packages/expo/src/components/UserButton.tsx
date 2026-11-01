import { useState } from 'react';
import { Image, Modal, Pressable, Text, View } from 'react-native';
import type { ZevAuthUser } from '@zevauth/js';
import { format } from '@zevauth/react/headless';
import { useNativeContext } from '../provider.js';
import { Button, Muted } from './parts.js';

function displayName(user: ZevAuthUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || '';
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A picture, or initials. Renders nothing when signed out. */
export function UserAvatar({ size = 32 }: { size?: number }) {
  const { state, theme } = useNativeContext('<UserAvatar>');
  const t = theme.tokens;
  if (!state.user) return null;
  const name = displayName(state.user);
  return (
    <View
      accessible={false}
      style={theme.style('avatar', {
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: t.primary,
      })}
    >
      {state.user.imageUrl ? (
        <Image source={{ uri: state.user.imageUrl }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ color: t.onPrimary, fontWeight: '600', fontSize: size * 0.38, fontFamily: t.fontFamily }}>{initials(name)}</Text>
      )}
    </View>
  );
}

export interface UserButtonProps {
  /** Called after signing out, to navigate. */
  onSignedOut?: () => void;
  /** Adds "Manage account"; called when it is pressed, so you can open your profile screen. */
  onManageAccount?: () => void;
}

/**
 * The signed-in person, and the way out: an avatar that opens a sheet.
 * Renders nothing when signed out, like the web component.
 */
export function UserButton({ onSignedOut, onManageAccount }: UserButtonProps) {
  const { client, state, strings, native, theme } = useNativeContext('<UserButton>');
  const t = theme.tokens;
  const [open, setOpen] = useState(false);
  if (!state.user) return null;
  const name = displayName(state.user) || native.accountMenu;

  return (
    <>
      <Pressable
        testID="zevauth-user-button"
        accessibilityRole="button"
        accessibilityLabel={format(strings.userButton.menuLabel, { name })}
        onPress={() => setOpen(true)}
        hitSlop={8}
      >
        <UserAvatar />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable
          accessibilityLabel={native.close}
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
        />
        <View
          testID="zevauth-user-menu"
          style={theme.style('menu', {
            backgroundColor: t.surface,
            borderTopLeftRadius: Math.min(t.radius * 2, 24),
            borderTopRightRadius: Math.min(t.radius * 2, 24),
            padding: 20,
            paddingBottom: 36,
            gap: 12,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <UserAvatar size={40} />
            <View style={{ flexShrink: 1 }}>
              <Text style={{ color: t.text, fontWeight: '600', fontSize: t.fontSize, fontFamily: t.fontFamily }} numberOfLines={1}>
                {name}
              </Text>
              {state.user.email && state.user.email !== name ? <Muted>{state.user.email}</Muted> : null}
            </View>
          </View>
          {state.organization ? <Muted>{`${strings.userButton.organization}: ${state.organization.name}`}</Muted> : null}
          {onManageAccount ? (
            <Button
              variant="secondary"
              label={strings.userButton.manageAccount}
              onPress={() => {
                setOpen(false);
                onManageAccount();
              }}
            />
          ) : null}
          <Button
            variant="secondary"
            label={strings.userButton.signOut}
            testID="zevauth-sign-out"
            onPress={() => {
              setOpen(false);
              void client.signOut().then(() => onSignedOut?.());
            }}
          />
        </View>
      </Modal>
    </>
  );
}
