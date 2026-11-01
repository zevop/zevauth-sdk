# @zevauth/vue

ZevAuth for Vue 3 and Nuxt: composables, control components, and the drop-in
sign-in, sign-up, profile and organization components.

```bash
npm install @zevauth/vue
```

```ts
// main.ts
import { createApp } from 'vue';
import { createZevAuth } from '@zevauth/vue';
import App from './App.vue';

createApp(App)
  .use(createZevAuth({ publishableKey: import.meta.env.VITE_ZEVAUTH_KEY }))
  .mount('#app');
```

```vue
<script setup lang="ts">
import { SignedIn, SignedOut, SignIn, UserButton, useUser } from '@zevauth/vue';
const { user } = useUser();
</script>

<template>
  <SignedOut><SignIn after-sign-in-url="/dashboard" /></SignedOut>
  <SignedIn>
    <UserButton />
    <p>Hello {{ user?.firstName }}</p>
  </SignedIn>
</template>
```

`useUser`, `useAuth`, `useOrganization` and `useOrganizationList` return the
same fields as the React hooks, as refs. `appearance` and `localization` work
as they do everywhere else, on the plugin or on one component.

## Documentation

<https://docs.zevauth.com/sdk/vue>

## License

MIT
