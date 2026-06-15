export default async function loadWoff2() {
  return {
    compress(input: ArrayBuffer | Uint8Array) {
      return input instanceof Uint8Array ? input : new Uint8Array(input);
    },
    decompress(input: ArrayBuffer | Uint8Array) {
      return input instanceof Uint8Array ? input : new Uint8Array(input);
    },
  };
}
