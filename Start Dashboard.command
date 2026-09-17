#!/bin/bash
# Double-click this file in Finder to build and launch the FAU Men's Soccer Dashboard.
# Your browser will open automatically once it's ready.
# To stop the dashboard, close this window (or press Control+C), then press Enter to close.

cd "$(dirname "$0")" || exit 1

echo "=================================================="
echo " FAU Men's Soccer Dashboard"
echo "=================================================="
echo ""
echo "Building the app (this takes a few seconds)..."
echo ""

npm run build

if [ $? -ne 0 ]; then
  echo ""
  echo "Something went wrong during the build (see the errors above)."
  echo "Press Enter to close this window."
  read -r
  exit 1
fi

echo ""
echo "Starting the dashboard..."
echo "Opening http://localhost:4000 in your browser..."
echo ""
echo "Leave this window open while you use the dashboard."
echo "When you're done, close this window (or press Control+C) to stop it."
echo ""

( sleep 2 && open "http://localhost:4000" ) &

npm run start

echo ""
echo "Dashboard stopped. Press Enter to close this window."
read -r
