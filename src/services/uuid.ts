// Dependency-free RFC-4122 v4 UUID.
//
// WHY: Hermes (React Native) has NO global `crypto`, so `crypto.randomUUID()` throws
// `ReferenceError: Property 'crypto' doesn't exist` on-device — which silently broke every
// Storage upload (bug-report screenshots, voice recordings) that used it to name the object.
// This generator works in every runtime (Hermes, Node, web). It is used only for Storage object
// keys — uniqueness matters, cryptographic strength does not — so Math.random is sufficient.
export function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
