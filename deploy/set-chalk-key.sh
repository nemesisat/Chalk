#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/home/ubuntu/chalk/.env.local"

umask 077
read -rsp "Paste OpenAI API key, then press Enter: " key
printf "\n"

if [[ ${#key} -lt 20 ]]; then
  echo "Key was empty or too short; nothing was saved."
  exit 1
fi

printf "OPENAI_API_KEY=%s\n" "$key" > "$ENV_FILE"
unset key
chmod 600 "$ENV_FILE"

sudo systemctl restart chalk

pid="$(systemctl show chalk -p MainPID --value)"
if [[ "$pid" -le 0 ]] || ! sudo sh -c "tr '\0' '\n' < /proc/$pid/environ" \
  | awk -F= '$1 == "OPENAI_API_KEY" && length($2) > 20 { found=1 } END { exit !found }'; then
  echo "The key file was written, but Chalk did not load it."
  exit 1
fi

echo "Key saved securely and Chalk restarted successfully."
