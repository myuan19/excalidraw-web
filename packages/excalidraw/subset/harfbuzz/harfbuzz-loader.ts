export default async function loadHbSubset() {
  return {
    subset(arrayBuffer: ArrayBuffer, _codePoints?: Set<number>) {
      return new Uint8Array(arrayBuffer);
    },
  };
}
