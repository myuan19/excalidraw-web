export default async function loadHbSubset() {
  return {
    subset(arrayBuffer: ArrayBuffer) {
      return new Uint8Array(arrayBuffer);
    },
  };
}
