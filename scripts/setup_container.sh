#!/usr/bin/env bash
# Provision a headless Godot 4.5.1 toolchain and sanity-check the project.
# If invoked by sh or without exec bit, re-exec under bash.
[ -n "${BASH_VERSION:-}" ] || exec /usr/bin/env bash "$0" "$@"

set -euo pipefail
# set -x  # uncomment if you want verbose logs always

# Use sudo only if needed/available
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "This script needs root or sudo to install packages." >&2
    exit 1
  fi
fi

# Choose an install prefix we can actually write to
PREFIX="/usr/local"
if ! $SUDO sh -c "test -w $PREFIX/bin" 2>/dev/null; then
  PREFIX="$HOME/.local"
  mkdir -p "$PREFIX/bin"
  export PATH="$PREFIX/bin:$PATH"
fi

# Use the writable prefix for the Godot binary
INSTALL_BIN="${INSTALL_BIN:-$PREFIX/bin/godot}"
export INSTALL_BIN

# ---- Configuration (override via env if needed) -----------------------------
GODOT_VERSION="${GODOT_VERSION:-4.5.1}"     # target engine version
GODOT_CHANNEL="${GODOT_CHANNEL:-stable}"    # usually 'stable'
GODOT_FLAVOR="${GODOT_FLAVOR:-standard}"    # 'standard' or 'mono' (for C#)
INSTALL_BIN="/usr/local/bin/godot"          # where to install the CLI binary
TEMPLATES_ROOT="${HOME}/.local/share/godot/export_templates"
TEMPLATES_DIR="${TEMPLATES_ROOT}/${GODOT_VERSION}-${GODOT_CHANNEL}"
PROJECT_DIR="${PROJECT_DIR:-$PWD}"          # assumes script runs in repo root

echo "==> Setting up Godot ${GODOT_VERSION}-${GODOT_CHANNEL} (${GODOT_FLAVOR})"

# ---- OS deps (works on Ubuntu 24.04 and earlier) ---------------------------
echo "==> Installing base packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y

# Pick the right ALSA package name (24.04 uses t64)
ALSA_PKG=libasound2
if . /etc/os-release && [ "${VERSION_CODENAME:-}" = "noble" ]; then
  ALSA_PKG=libasound2t64
fi

sudo apt-get install -y --no-install-recommends \
  wget curl unzip ca-certificates git \
  libxi6 libxrandr2 libxcursor1 libxinerama1 libgl1 \
  "$ALSA_PKG" libpulse0 libudev1 \
  xvfb xauth \
  python3 python3-pip make g++ pkg-config


# ---- Download a headless-capable Godot binary -------------------------------
# We try common 4.x artifact names to keep this robust across sub-minor changes.
echo "==> Fetching Godot headless/editor binary"
work=/tmp/godot_setup
rm -rf "$work" && mkdir -p "$work"
base="https://github.com/godotengine/godot/releases/download/${GODOT_VERSION}-${GODOT_CHANNEL}"

if [[ "${GODOT_FLAVOR}" == "mono" ]]; then
  candidates=(
    "Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_mono_linux_console_x86_64.zip"
    "Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_mono_linux_server.x86_64.zip"
    "Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_mono_linux_x86_64.zip" # GUI editor fallback
  )
  templates_name="Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_mono_export_templates.tpz"
else
  candidates=(
    "Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_linux_console.x86_64.zip"
    "Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_linux_server.x86_64.zip"
    "Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_linux.x86_64.zip" # GUI editor fallback
  )
  templates_name="Godot_v${GODOT_VERSION}-${GODOT_CHANNEL}_export_templates.tpz"
fi

zip_found=""
for z in "${candidates[@]}"; do
  if curl -fsSLI "${base}/${z}" >/dev/null 2>&1; then
    zip_found="$z"; break
  fi
done

if [[ -z "$zip_found" ]]; then
  echo "ERROR: Could not find a matching Godot artifact for ${GODOT_VERSION}-${GODOT_CHANNEL} (${GODOT_FLAVOR})."
  echo "       Please adjust GODOT_VERSION/GODOT_FLAVOR or update candidate names."
  exit 2
fi

echo "==> Downloading ${zip_found}"
curl -fsSL -o "${work}/godot.zip" "${base}/${zip_found}"
unzip -o "${work}/godot.zip" -d "${work}"

# Locate the extracted binary (name varies slightly by build).
bin_path="$(find "${work}" -maxdepth 1 -type f -name 'Godot_*' -o -name 'godot*' | head -n1)"
if [[ -z "${bin_path}" ]]; then
  echo "ERROR: Godot binary not found in archive."
  exit 3
fi
$SUDO install -m 0755 "${bin_path}" "${INSTALL_BIN}"

# If we only got the GUI editor, create a wrapper that uses xvfb for headless ops when needed.
if "${INSTALL_BIN}" --help 2>&1 | grep -qi 'headless'; then
  echo "==> Installed headless-capable Godot."
else
  echo "==> Installed GUI editor; creating xvfb-run wrapper for headless usage."
  $SUDO tee /usr/local/bin/godot-headless >/dev/null <<'EOS'
#!/usr/bin/env bash
exec xvfb-run -a /usr/local/bin/godot "$@"
EOS
  $SUDO chmod +x /usr/local/bin/godot-headless
  INSTALL_BIN="/usr/local/bin/godot-headless"
fi

echo "==> Godot version:"
"${INSTALL_BIN}" --version || true

# ---- Export templates --------------------------------------------------------
echo "==> Installing export templates"
mkdir -p "${TEMPLATES_DIR}"
curl -fsSL -o "${work}/templates.tpz" "${base}/${templates_name}"
# tpz is a zip; unzip directly into the versioned templates dir
unzip -o "${work}/templates.tpz" -d "${TEMPLATES_DIR}"

# ---- Optional: .NET/Mono for C# projects ------------------------------------
if [[ "${GODOT_FLAVOR}" == "mono" ]]; then
  echo "==> Installing .NET SDK (required for C#)"
  # MS repo bootstrap (Ubuntu 24.04)
  sudo apt-get install -y --no-install-recommends dotnet-sdk-8.0 || {
    # If the SDK package isn’t present by default, add MS feed:
    wget -q https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb -O "$work/msprod.deb"
    $SUDO dpkg -i "$work/msprod.deb"
    $SUDO apt-get update -y
    $SUDO apt-get install -y --no-install-recommends dotnet-sdk-8.0
  }
fi

# ---- Project sanity checks ---------------------------------------------------
if [[ -f "${PROJECT_DIR}/project.godot" ]]; then
  echo "==> Running project checks"
  set +e
  # Script/type-check (4.x supports --check-only; if not, loading & quitting still surfaces errors)
  "${INSTALL_BIN}" --headless --path "${PROJECT_DIR}" --check-only 2>/tmp/godot_check.stderr
  status=$?
  if [[ $status -ne 0 ]]; then
    echo "Godot script check failed:"
    cat /tmp/godot_check.stderr
    exit $status
  fi

  # If C# is present, build solutions so agents get compiler diagnostics
  if [[ -f "${PROJECT_DIR}/project.sln" || -d "${PROJECT_DIR}/.godot/mono" ]]; then
    "${INSTALL_BIN}" --headless --path "${PROJECT_DIR}" --build-solutions --quit
    status=$?
    if [[ $status -ne 0 ]]; then
      echo "Godot C# solution build failed."
      exit $status
    fi
  fi
  set -e
else
  echo "NOTE: No project.godot in ${PROJECT_DIR}; skipping checks."
fi

# ---- Done --------------------------------------------------------------------
echo "==> Godot setup complete."
