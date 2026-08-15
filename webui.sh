#!/system/bin/sh

# KernelSU 推荐用法：获取模块自身目录
MODDIR=${0%/*}

STORAGE_DIR="/data/adb/phone2usbstorage"
IMG_FILE="$STORAGE_DIR/storage.img"

case $1 in
    create)
        SIZE_MB=$2
        if [ -z "$SIZE_MB" ]; then
            echo "Error: size not specified"
            exit 1
        fi
        if ! echo "$SIZE_MB" | grep -qE '^[0-9]+$'; then
            echo "Error: size must be a positive integer (MB)"
            exit 1
        fi
        if [ $SIZE_MB -gt 65536 ]; then
            echo "Error: size exceeds 64GB (65536 MB)"
            exit 1
        fi
        echo "Creating directory $STORAGE_DIR"
        mkdir -p "$STORAGE_DIR"
        echo "Creating image file $IMG_FILE of size ${SIZE_MB}MB"
        dd if=/dev/zero of="$IMG_FILE" bs=1M count=$SIZE_MB
        if [ $? -ne 0 ]; then
            echo "Error: dd failed"
            exit 1
        fi
        echo "Setting SELinux context"
        chcon u:object_r:media_rw_data_file:s0 "$IMG_FILE"
        echo "Image created successfully"
        ;;
    delete)
        if [ -f "$IMG_FILE" ]; then
            echo "Deleting $IMG_FILE"
            rm "$IMG_FILE"
            echo "Image deleted"
        else
            echo "Image not found"
        fi
        ;;
    status)
        if [ -f "$IMG_FILE" ]; then
            echo "exists"
            ls -lh "$IMG_FILE" | awk '{print $5}'
        else
            echo "not_exists"
        fi
        ;;
    *)
        echo "Usage: $0 {create|delete|status} [size_in_MB]"
        exit 1
        ;;
esac