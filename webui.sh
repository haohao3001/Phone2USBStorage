#!/system/bin/sh

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

        # 快速创建：优先 truncate 生成稀疏文件（只改大小、不写零，瞬间完成），
        # 其次 dd conv=sparse（跳过全零块），最后退回普通 dd 全量写入。
        if command -v truncate >/dev/null 2>&1; then
            truncate -s "${SIZE_MB}M" "$IMG_FILE"
        else
            dd if=/dev/zero of="$IMG_FILE" bs=1M count=$SIZE_MB conv=sparse 2>/dev/null \
                || dd if=/dev/zero of="$IMG_FILE" bs=1M count=$SIZE_MB
        fi
        rc=$?
        if [ $rc -ne 0 ]; then
            echo "Error: failed to create image"
            rm -f "$IMG_FILE"
            exit 1
        fi

        # 校验实际大小（稀疏文件 ls 显示逻辑大小，应与请求一致）
        ACTUAL=$(ls -l "$IMG_FILE" 2>/dev/null | awk '{print $5}')
        EXPECT=$((SIZE_MB * 1024 * 1024))
        if [ -z "$ACTUAL" ] || [ "$ACTUAL" -ne "$EXPECT" ]; then
            echo "Error: image size mismatch (expected $EXPECT, got $ACTUAL)"
            rm -f "$IMG_FILE"
            exit 1
        fi

        echo "Setting SELinux context"
        chcon u:object_r:media_rw_data_file:s0 "$IMG_FILE"

        # 稀疏文件不预占空间，提示剩余空间是否足够容纳整盘写入
        AVAIL_KB=$(df -P -k "$STORAGE_DIR" 2>/dev/null | tail -1 | awk '{print $4}')
        if [ -n "$AVAIL_KB" ]; then
            AVAIL_MB=$((AVAIL_KB / 1024))
            if [ "$AVAIL_MB" -lt "$SIZE_MB" ]; then
                echo "Warning: only ${AVAIL_MB}MB free on $STORAGE_DIR"
                echo "Image is sparse (${SIZE_MB}MB logical) and will fail once full"
            fi
        fi

        echo "Image created successfully (${SIZE_MB}MB, sparse)"
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