#!/system/bin/sh

MODULE_DIR="/data/adb/phone2usbstorage"
IMG_FILE="$MODULE_DIR/storage.img"

GADGET="/config/usb_gadget/g1"
CONFIG="$GADGET/configs/b.1"
FUNCTION="$GADGET/functions/mass_storage.0"
LUN_FILE="$FUNCTION/lun.0/file"

# 检查模块目录
if [ ! -d "$MODULE_DIR" ]; then
    mkdir -p "$MODULE_DIR"
    echo "[Phone2USBStorage] Created $MODULE_DIR"
fi

# 检查镜像文件
if [ ! -f "$IMG_FILE" ]; then
    echo "[Phone2USBStorage] ERROR: storage.img not found"
    echo "[Phone2USBStorage] Please create $MODULE_DIR/storage.img first"
    exit 1
fi

# 获取 UDC
UDC=$(cat "$GADGET/UDC")

enable_mass_storage()
{
    echo "[Phone2USBStorage] Enabling Mass Storage..."

    # 解绑 USB Gadget
    echo "" > "$GADGET/UDC"

    # 设置后端镜像
    echo "$IMG_FILE" > "$LUN_FILE"

    # 添加 mass_storage function
    if [ ! -L "$CONFIG/mass_storage.0" ]; then
        ln -s "$FUNCTION" "$CONFIG/mass_storage.0"
    fi

    # 重新绑定 USB
    echo "$UDC" > "$GADGET/UDC"

    echo "[Phone2USBStorage] Mass Storage enabled"
}


disable_mass_storage()
{
    echo "[Phone2USBStorage] Disabling Mass Storage..."

    # 解绑 USB Gadget
    echo "" > "$GADGET/UDC"

    # 移除 function link
    if [ -L "$CONFIG/mass_storage.0" ]; then
        rm "$CONFIG/mass_storage.0"
    fi

    # 清空镜像
    echo "" > "$LUN_FILE"

    # 恢复 USB
    echo "$UDC" > "$GADGET/UDC"

    echo "[Phone2USBStorage] Mass Storage disabled"
}


# 根据 lun.0/file 判断当前状态
CURRENT=$(cat "$LUN_FILE" 2>/dev/null)

if [ -z "$CURRENT" ]; then
    enable_mass_storage
else
    disable_mass_storage
fi