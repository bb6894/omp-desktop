export type RuntimeManifest = {
  ompVersion: "17.4.1";
  codingAgentPackage: "@oh-my-pi/pi-coding-agent@17.4.1";
  nativePackage: "@oh-my-pi/pi-natives-win32-x64@17.4.1";
  fileName: "omp-windows-x64.exe";
  sourceUrl: "https://github.com/bb6894/omp-desktop/releases/download/runtime-v17.4.1/omp-windows-x64.exe";
  sha256: "0df097cc7af44247d33bae32d2e5e5baf2911ef7888ca5583e83fdab59db7a25";
  rpcVersions: readonly [1, 2];
  physicalFrameBytes: 1048576;
  reassembledFrameBytes: 67108864;
};

export const RUNTIME_MANIFEST: RuntimeManifest = {
  ompVersion: "17.4.1",
  codingAgentPackage: "@oh-my-pi/pi-coding-agent@17.4.1",
  nativePackage: "@oh-my-pi/pi-natives-win32-x64@17.4.1",
  fileName: "omp-windows-x64.exe",
  sourceUrl: "https://github.com/bb6894/omp-desktop/releases/download/runtime-v17.4.1/omp-windows-x64.exe",
  sha256: "0df097cc7af44247d33bae32d2e5e5baf2911ef7888ca5583e83fdab59db7a25",
  rpcVersions: [1, 2],
  physicalFrameBytes: 1048576,
  reassembledFrameBytes: 67108864
};
