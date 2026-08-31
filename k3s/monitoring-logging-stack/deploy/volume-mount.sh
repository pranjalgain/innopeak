#!/bin/bash

set -e

MOUNT_POINT="/monitoring"

# Step 1: Detect the first unused volume (not mounted)
DEVICE=$(lsblk -dpno NAME,TYPE | grep disk | awk '{print $1}' | while read dev; do
    MOUNTED=$(lsblk -no MOUNTPOINT "$dev" | grep -v "^$")
    if [ -z "$MOUNTED" ]; then
        echo "$dev"
        break
    fi
done)

if [ -z "$DEVICE" ]; then
    echo "No unmounted block device found."
    exit 1
fi

echo "Detected new volume: $DEVICE"

# Step 2: Format the disk if no filesystem
if ! file -s "$DEVICE" | grep -q 'filesystem'; then
    echo "Formatting $DEVICE with ext4..."
    sudo mkfs.ext4 "$DEVICE"
else
    echo "$DEVICE already has a filesystem"
fi

# Step 3: Create mount point and mount the volume
sudo mkdir -p "$MOUNT_POINT"
sudo mount "$DEVICE" "$MOUNT_POINT"

# Step 4: Persist in /etc/fstab
UUID=$(sudo blkid -s UUID -o value "$DEVICE")
echo "UUID=$UUID $MOUNT_POINT ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab

# Step 5: Create Loki, Prometheus, and Grafana data directories
sudo mkdir -p "$MOUNT_POINT/loki-data" "$MOUNT_POINT/prometheus-data" "$MOUNT_POINT/grafana-data"
sudo chmod -R 777 "$MOUNT_POINT"

echo "Volume mounted to $MOUNT_POINT and directories created."
