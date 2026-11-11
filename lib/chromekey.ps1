# Holt Chromes 32-Byte-DPAPI-Key aus "Local State" (os_crypt.encrypted_key).
# Gibt ihn als Base64 auf stdout aus; Fehler/Diagnose gehen nach stderr.
param(
  [string]$LocalState = "$env:LOCALAPPDATA\Google\Chrome\User Data\Local State"
)

$ErrorActionPreference = 'Stop'

$cs = @'
using System;
using System.Runtime.InteropServices;

public static class DpapiBox {
    [StructLayout(LayoutKind.Sequential)]
    private struct DATA_BLOB { public int cbData; public IntPtr pbData; }

    [DllImport("crypt32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CryptUnprotectData(
        ref DATA_BLOB pDataIn, IntPtr ppszDataDescr, IntPtr pOptionalEntropy,
        IntPtr pvReserved, IntPtr pPromptStruct, int dwFlags, out DATA_BLOB pDataOut);

    public static byte[] Unprotect(byte[] data) {
        DATA_BLOB inB = new DATA_BLOB();
        inB.cbData = data.Length;
        inB.pbData = Marshal.AllocHGlobal(data.Length);
        Marshal.Copy(data, 0, inB.pbData, data.Length);
        DATA_BLOB outB = new DATA_BLOB();
        try {
            if (!CryptUnprotectData(ref inB, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0, out outB))
                throw new Exception("CryptUnprotectData failed, win32=" + Marshal.GetLastWin32Error());
            byte[] res = new byte[outB.cbData];
            Marshal.Copy(outB.pbData, res, 0, outB.cbData);
            return res;
        } finally {
            Marshal.FreeHGlobal(inB.pbData);
            if (outB.pbData != IntPtr.Zero) { Marshal.FreeHGlobal(outB.pbData); }
        }
    }
}
'@
Add-Type -TypeDefinition $cs -Language CSharp

if (-not (Test-Path $LocalState)) { throw "Local State nicht gefunden: $LocalState" }
$ls = Get-Content $LocalState -Raw | ConvertFrom-Json
if (-not $ls.os_crypt.encrypted_key) { throw "os_crypt.encrypted_key fehlt in Local State" }

$blob = [Convert]::FromBase64String($ls.os_crypt.encrypted_key)
$prefix = [Text.Encoding]::ASCII.GetString($blob, 0, 5)
if ($prefix -ne 'DPAPI') { throw "Unerwartetes Prefix: $prefix" }

$payload = New-Object byte[] ($blob.Length - 5)
[Array]::Copy($blob, 5, $payload, 0, $payload.Length)
$key = [DpapiBox]::Unprotect($payload)
if ($key.Length -ne 32) { throw "Key hat $($key.Length) Bytes statt 32" }

[Console]::Out.Write([Convert]::ToBase64String($key))
