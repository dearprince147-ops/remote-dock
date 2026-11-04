import { describe, expect, it } from 'vitest'
import { parseAdbDevices, parseLsOutput, parseStatLine, parseStatOutput } from '@main/devices/adbParse'

describe('parseAdbDevices', () => {
  it('parses USB and Wi-Fi devices, skipping daemon noise', () => {
    const output = `* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
R58M12345              device product:beyond1lte model:SM_G973F device:beyond1 transport_id:1
192.168.1.50:5555      device product:panther model:Pixel_7 device:panther transport_id:2
emulator-5554          unauthorized
ABC123                 offline transport_id:4

`
    const devices = parseAdbDevices(output)
    expect(devices).toHaveLength(4)
    expect(devices[0]).toMatchObject({ serial: 'R58M12345', state: 'device', model: 'SM G973F' })
    expect(devices[1]).toMatchObject({ serial: '192.168.1.50:5555', state: 'device', model: 'Pixel 7' })
    expect(devices[2]).toMatchObject({ serial: 'emulator-5554', state: 'unauthorized', model: 'emulator-5554' })
    expect(devices[3]).toMatchObject({ serial: 'ABC123', state: 'offline' })
  })
})

describe('parseStatLine', () => {
  it('parses directories', () => {
    const entry = parseStatLine("directory|4096|1700000000|/sdcard/Download")
    expect(entry).toMatchObject({
      name: 'Download',
      path: '/sdcard/Download',
      isDir: true,
      isSymlink: false,
      size: 0,
      mtime: 1700000000000
    })
  })
  it('parses files and keeps pipes in the name', () => {
    const entry = parseStatLine("regular file|1234|1700000001|/sdcard/a|b.txt")
    expect(entry?.name).toBe('a|b.txt')
    expect(entry?.size).toBe(1234)
    expect(entry?.isDir).toBe(false)
  })
  it('parses symlinks and ignores stat errors', () => {
    expect(parseStatLine("symbolic link|10|1700000000|/sdcard/link")?.isSymlink).toBe(true)
    expect(parseStatLine('stat: /sdcard/nope: No such file or directory')).toBeNull()
    expect(parseStatLine('')).toBeNull()
  })
  it('parses the first usable line of stat output', () => {
    expect(parseStatOutput("regular file|10|1700000000|/x\n")?.name).toBe('x')
  })
})

describe('parseLsOutput', () => {
  it('parses modern toybox ls -la output', () => {
    const output = `total 16
drwxrwx--x 4 root sdcard_rw 4096 2024-05-01 12:34 DCIM
-rw-rw---- 1 root sdcard_rw 1234 2024-05-02 08:15 photo one.jpg
lrwxrwxrwx 1 root root 21 2024-05-03 09:00 shortcut -> /sdcard/DCIM
.circle 1 2 3 4 5 6 7 8 9 10 11
`
    const entries = parseLsOutput(output, '/sdcard')
    expect(entries).toHaveLength(3)
    expect(entries[0]).toMatchObject({ name: 'DCIM', path: '/sdcard/DCIM', isDir: true })
    expect(entries[1]).toMatchObject({ name: 'photo one.jpg', size: 1234, isDir: false })
    expect(entries[2]).toMatchObject({ name: 'shortcut', isSymlink: true })
  })

  it('parses old month/day output', () => {
    const output = `total 4
-rw-r--r-- 1 root root 42 Jan  2 03:04 notes.txt
`
    const entries = parseLsOutput(output, '/sdcard')
    expect(entries[0]?.name).toBe('notes.txt')
    expect(entries[0]?.size).toBe(42)
  })
})
