# Packaging

## `nsis/hooks.nsh`

Hooked into the Tauri NSIS installer through `bundle.windows.nsis.installerHooks`
in `tauri.conf.json`. It clears the per-user `HKCU\...\Run` value that TokenTray
writes for "Start with Windows" (see `src/autostart.rs`), which the bundler does
not know about. Without it, uninstalling with that setting enabled leaves Windows
trying to launch a deleted executable at every sign-in.

Build the installer locally with the Tauri CLI:

```powershell
cargo tauri build
```

The output is `target/release/bundle/nsis/TokenTray_<version>_x64-setup.exe`.
The release workflow renames it to `tokentray-v<version>-windows-x64-setup.exe`.

## `winget/`

Source of truth for TokenTray's entry in [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs).
Not consumed by the build; it exists so the manifest that gets submitted is
reviewable here first.

Keep only the three manifest files in that directory. `winget validate` walks
the whole folder and fails on anything it cannot parse as a manifest, which is
why this note lives one level up.

### First submission (manual)

The initial package must be opened as a pull request by hand. The automated job
in `.github/workflows/release.yml` only updates a package that already exists.

1. Publish the release so the installer URL resolves. `v0.1.0` is published and
   its `InstallerSha256` is already filled in.
2. For a later version, replace `InstallerSha256` with the digest of that
   release's setup executable, taken from its `SHA256SUMS.txt`:

   ```powershell
   (Get-FileHash .\tokentray-v0.1.0-windows-x64-setup.exe -Algorithm SHA256).Hash
   ```

   Note `SHA256SUMS.txt` lists names in binary mode (`<hex> *<name>`); the
   asterisk is a `sha256sum` marker, not part of the filename.
3. Validate locally:

   ```powershell
   winget validate --manifest .\packaging\winget
   ```

4. Copy the three files into a fork of `microsoft/winget-pkgs` under
   `manifests/d/deeno13/TokenTray/0.1.0/` and open a pull request.

Note the version asymmetry, which is correct and should not be "fixed":
`PackageVersion` is `0.1.0` (no leading `v`), while the release tag and asset
filename are `v0.1.0` / `tokentray-v0.1.0-windows-x64-setup.exe`.

The manifest points at the NSIS installer rather than the portable executable,
so winget installs register in Apps & Features like any other package.
`InstallerType` is `nullsoft`, which is winget's name for NSIS.

### Later versions (automated)

Once the package exists, the `winget` job in the Release workflow submits
version bumps with [Komac](https://github.com/russellbanks/Komac). It is a no-op
unless a `WINGET_TOKEN` repository secret holding a GitHub token with fork and
pull-request rights on `microsoft/winget-pkgs` is configured.

Keep these files updated alongside automated submissions so the reviewed
manifest and the published manifest do not drift.
