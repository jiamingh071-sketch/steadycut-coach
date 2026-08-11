# Android 安装与更新

1. 从 GitHub Releases 下载 `SteadyCut-v2.0.0-android.apk` 和同名 `.sha256` 文件。
2. 在电脑上核对 SHA-256；Windows PowerShell 可运行 `Get-FileHash .\SteadyCut-v2.0.0-android.apk -Algorithm SHA256`。
3. 把 APK 通过数据线、局域网传输或聊天软件发送到 Android 手机。
4. 在手机设置中仅为当前文件管理器允许“安装未知应用”，完成后可关闭该权限。
5. 打开 APK 安装；首次通知和震动权限可按需要授权。

同一签名的后续版本可覆盖安装并保留应用数据。卸载应用会删除本机训练记录；更新或换设备前请先在“更多 → 加密备份”导出 `.steadycut` 文件。
