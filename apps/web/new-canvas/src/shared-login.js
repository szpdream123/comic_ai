export async function openSharedLoginModal() {
  const sharedAppModule = "/app.js";
  const { openLoginModal } = await import(sharedAppModule);
  openLoginModal();
}
