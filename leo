sudo tee /etc/systemd/system/wifi-powersave-off.service <<'EOF'
[Unit]
Description=Disable WiFi power save
After=sys-subsystem-net-devices-wlan0.device
Wants=sys-subsystem-net-devices-wlan0.device

[Service]
Type=oneshot
ExecStart=/bin/sh -c 'iw dev wlan0 set power_save off'

[Install]
WantedBy=multi-user.target
EOF
