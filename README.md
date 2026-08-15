神秘的hyw项目，让你的手机变成U盘(可在BIOS/UEFI中使用)  
参考了[ISODroid](https://github.com/rodrig20/ISOdroid)  
博客链接[让你的手机变成一个U盘](https://blog.haohao3001.top/2026/08/10/android_usb_gadget_bootable_usb_drive/)  
目前仅在REDMI K90 Pro Max下测试过
  
使用方法，把storage.img放在/data/adb/phone2usbstorage下  
生成并放置storage.img，在Linux下执行以下命令(已实现自动创建，但是需要在电脑上通过Windows的磁盘管理或Linux的cfdisk自行分区)
```bash
dd if=/dev/zero of=storage.img bs=1M count=1024
parted storage.img --script mklabel gpt 
parted storage.img --script mkpart primary fat32 1MiB 100% #把所有空间划给这个FAT32分区
sudo losetup --partscan --find --show storage.img
sudo mkfs.fat -F32 /dev/loop0p1
adb push storage.img /data/local/tmp
adb shell su -c 'mv /data/local/tmp/storage.img /data/adb/phone2usbstorage/'
adb shell su -c 'chcon u:object_r:media_rw_data_file:s0 /data/adb/phone2usbstorage/storage.img'
```
