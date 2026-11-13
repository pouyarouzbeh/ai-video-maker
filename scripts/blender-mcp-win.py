"""Run Blender MCP's headless subprocess with file-backed output on Windows."""

import asyncio
import subprocess
import tempfile
from contextlib import ExitStack

from blender_mcp_server import headless
from blender_mcp_server.server import main


class _FileBackedProcess:
    def __init__(self, process, stdout, stderr, logs):
        self._process = process
        self._stdout = stdout
        self._stderr = stderr
        self._logs = logs

    def __getattr__(self, name):
        return getattr(self._process, name)

    async def wait(self):
        code = await self._process.wait()
        self._logs.close()
        return code

    async def communicate(self):
        await self._process.wait()
        try:
            self._stdout.seek(0)
            self._stderr.seek(0)
            return self._stdout.read(), self._stderr.read()
        finally:
            self._logs.close()


class _WindowsHeadlessAsyncio:
    def __getattr__(self, name):
        return getattr(asyncio, name)

    @staticmethod
    async def create_subprocess_exec(*args, **kwargs):
        # Blender 5.2 stalled with asyncio subprocess pipes on this Windows host.
        # Keep the upstream result and cancellation handling while collecting logs on disk.
        with ExitStack() as logs:
            stdout = logs.enter_context(tempfile.TemporaryFile())
            stderr = logs.enter_context(tempfile.TemporaryFile())
            process = await asyncio.create_subprocess_exec(
                *args, **(kwargs | {"stdin": subprocess.DEVNULL, "stdout": stdout, "stderr": stderr})
            )
            return _FileBackedProcess(process, stdout, stderr, logs.pop_all())


if __name__ == "__main__":
    headless.asyncio = _WindowsHeadlessAsyncio()
    main()
