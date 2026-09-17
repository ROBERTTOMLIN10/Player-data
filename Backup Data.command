#!/bin/bash
# Double-click this file in Finder to back up your season's database and uploaded
# GPS files to your Documents folder. Your code is already backed up on GitHub,
# but the actual game data lives only on this Mac -- run this every so often
# (e.g. weekly, or after a big upload session) so a hard drive problem can't wipe your season.

cd "$(dirname "$0")" || exit 1

SOURCE_DIR="server/data"
BACKUP_ROOT="$HOME/Documents/FAU-Soccer-Dashboard-Backups"
STAMP=$(date +"%Y-%m-%d_%H%M%S")
DEST_DIR="$BACKUP_ROOT/backup-$STAMP"

echo "=================================================="
echo " FAU Men's Soccer Dashboard - Data Backup"
echo "=================================================="
echo ""

if [ ! -d "$SOURCE_DIR" ]; then
  echo "No data folder found at $SOURCE_DIR -- nothing to back up yet."
  echo "Press Enter to close this window."
  read -r
  exit 0
fi

mkdir -p "$DEST_DIR"
cp -R "$SOURCE_DIR/." "$DEST_DIR/"

echo "Backed up to:"
echo "  $DEST_DIR"
echo ""

# Keep only the 15 most recent backups so this folder doesn't grow forever.
cd "$BACKUP_ROOT" || exit 0
BACKUP_COUNT=$(ls -1d backup-* 2>/dev/null | wc -l | tr -d ' ')
if [ "$BACKUP_COUNT" -gt 15 ]; then
  ls -1d backup-* | sort | head -n -15 | while read -r old; do
    rm -rf "$old"
  done
  echo "(Trimmed older backups -- keeping the most recent 15.)"
  echo ""
fi

echo "Done. Press Enter to close this window."
read -r
