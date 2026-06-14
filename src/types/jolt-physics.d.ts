declare module "jolt-physics/wasm-compat" {
  type JoltInit = () => Promise<unknown>;
  const init: JoltInit;
  export default init;
}