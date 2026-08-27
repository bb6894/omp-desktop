import { expect, test } from "bun:test";
import { RUNTIME_MANIFEST } from "../src/runtime-manifest";

test("pins the verified OMP runtime combination", () => {
  expect(RUNTIME_MANIFEST.ompVersion).toBe("17.4.1");
  expect(RUNTIME_MANIFEST.codingAgentPackage).toBe("@oh-my-pi/pi-coding-agent@17.4.1");
  expect(RUNTIME_MANIFEST.nativePackage).toBe("@oh-my-pi/pi-natives-win32-x64@17.4.1");
  expect(RUNTIME_MANIFEST.fileName).toBe("omp-windows-x64.exe");
  expect(RUNTIME_MANIFEST.sha256).toBe(
    "0df097cc7af44247d33bae32d2e5e5baf2911ef7888ca5583e83fdab59db7a25"
  );
  expect(RUNTIME_MANIFEST.rpcVersions).toEqual([1, 2]);
  expect(RUNTIME_MANIFEST.physicalFrameBytes).toBe(1048576);
  expect(RUNTIME_MANIFEST.reassembledFrameBytes).toBe(67108864);
});
