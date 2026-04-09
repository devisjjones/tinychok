import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('generateVideoAttachmentPreview caches the derived jpeg and can reuse it after the source file is gone', async () => {
  const mediaRoot = await mkdtemp(join(tmpdir(), 'tinychok-video-preview-cache-'))

  try {
    const script = `
      import assert from 'node:assert/strict'
      import { execFile } from 'node:child_process'
      import { mkdir, readdir, rm } from 'node:fs/promises'
      import { join } from 'node:path'
      import { promisify } from 'node:util'
      import ffmpegStatic from 'ffmpeg-static'

      const execFileAsync = promisify(execFile)
      const mediaRoot = process.env.LOCAL_MEDIA_ROOT

      assert.ok(mediaRoot)

      const sourceDir = join(mediaRoot, 'attachments', '2026-04-09')
      await mkdir(sourceDir, { recursive: true })
      const sourcePath = join(sourceDir, 'preview-source.mp4')

      await execFileAsync(ffmpegStatic, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=#cc8844:s=32x18:r=1',
        '-t',
        '1',
        '-c:v',
        'mpeg4',
        '-pix_fmt',
        'yuv420p',
        sourcePath,
      ])

      const { generateVideoAttachmentPreview } = await import('./server/src/media.ts')
      const mediaUrl = '/uploads/attachments/2026-04-09/preview-source.mp4'

      const firstPreview = await generateVideoAttachmentPreview(mediaUrl)
      const cacheDirectory = join(mediaRoot, 'attachment-previews')
      const cachedFiles = await readdir(cacheDirectory)

      await rm(sourcePath, { force: true })

      const secondPreview = await generateVideoAttachmentPreview(mediaUrl)

      console.log(
        JSON.stringify({
          cachedFiles,
          firstSignature: Array.from(firstPreview.subarray(0, 3)),
          firstSize: firstPreview.byteLength,
          secondSignature: Array.from(secondPreview.subarray(0, 3)),
          secondSize: secondPreview.byteLength,
        }),
      )
    `

    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          LOCAL_MEDIA_ROOT: mediaRoot,
          TINYCHOK_MEDIA_BACKEND: 'local',
        },
      },
    )

    assert.equal(result.status, 0, result.stderr)
    const parsed = JSON.parse(result.stdout.trim()) as {
      cachedFiles: string[]
      firstSignature: number[]
      firstSize: number
      secondSignature: number[]
      secondSize: number
    }

    assert.equal(parsed.cachedFiles.length, 1)
    assert.deepEqual(parsed.firstSignature, [0xff, 0xd8, 0xff])
    assert.deepEqual(parsed.secondSignature, [0xff, 0xd8, 0xff])
    assert.ok(parsed.firstSize > 0)
    assert.equal(parsed.secondSize, parsed.firstSize)
  } finally {
    await rm(mediaRoot, { force: true, recursive: true })
  }
})
