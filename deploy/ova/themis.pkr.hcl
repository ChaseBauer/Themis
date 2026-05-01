packer {
  required_version = ">= 1.10.0"
  required_plugins {
    virtualbox = {
      source  = "github.com/hashicorp/virtualbox"
      version = ">= 1.0.0"
    }
  }
}

# ── Variables ─────────────────────────────────────────────────────────────────
variable "themis_version" {
  type    = string
  default = "latest"
  description = "Image tag to pull from GHCR at first boot (e.g. v1.2.0)"
}

variable "image_registry" {
  type    = string
  default = "ghcr.io/your-org"
  description = "Container registry prefix for themis-backend and themis-frontend images"
}

variable "vm_name" {
  type    = string
  default = "themis"
}

variable "disk_size_mb" {
  type    = number
  default = 20480  # 20 GB
}

variable "memory_mb" {
  type    = number
  default = 2048
}

variable "cpus" {
  type    = number
  default = 2
}

variable "ubuntu_iso_url" {
  type    = string
  default = "https://releases.ubuntu.com/24.04/ubuntu-24.04.4-live-server-amd64.iso"
}

variable "ubuntu_iso_checksum" {
  type    = string
  # Update this when upgrading the Ubuntu version
  default = "sha256:e907d92eeec9df64163a7e454cbc8d7755e8ddc7ed42f99dbc80c40f1a138433"
}

# ── Source ────────────────────────────────────────────────────────────────────
source "virtualbox-iso" "themis" {
  vm_name          = var.vm_name
  iso_url          = var.ubuntu_iso_url
  iso_checksum     = var.ubuntu_iso_checksum
  disk_size        = var.disk_size_mb
  memory           = var.memory_mb
  cpus             = var.cpus
  headless         = true
  guest_os_type    = "Ubuntu_64"
  format           = "ova"
  output_directory = "output-ova"
  output_filename  = "themis-${var.themis_version}"

  # Ubuntu autoinstall via HTTP served by Packer
  http_directory = "http"
  boot_wait      = "5s"
  boot_command = [
    "c<wait>",
    "linux /casper/vmlinuz --- autoinstall ds='nocloud-net;seedfrom=http://{{.HTTPIP}}:{{.HTTPPort}}/'<enter><wait>",
    "initrd /casper/initrd<enter><wait>",
    "boot<enter>"
  ]

  ssh_username         = "themis"
  ssh_password         = "themis-build-only"
  ssh_timeout          = "30m"
  ssh_handshake_attempts = 100

  shutdown_command = "echo 'themis-build-only' | sudo -S shutdown -P now"

  vboxmanage = [
    ["modifyvm", "{{.Name}}", "--nat-localhostreachable1", "on"],
    ["modifyvm", "{{.Name}}", "--audio",  "none"],
    ["modifyvm", "{{.Name}}", "--usb",    "off"],
  ]

  export_opts = [
    "--manifest",
    "--vsys", "0",
    "--description", "Themis Network Configuration Management Platform",
    "--version", var.themis_version,
  ]
}

# ── Build ─────────────────────────────────────────────────────────────────────
build {
  sources = ["source.virtualbox-iso.themis"]

  # Upload setup script and config files
  provisioner "file" {
    source      = "scripts/setup.sh"
    destination = "/tmp/setup.sh"
  }

  provisioner "file" {
    source      = "../../vendor_profiles.toml"
    destination = "/tmp/vendor_profiles.toml"
  }

  # Run main provisioning
  provisioner "shell" {
    environment_vars = [
      "THEMIS_VERSION=${var.themis_version}",
      "IMAGE_REGISTRY=${var.image_registry}",
    ]
    execute_command = "echo 'themis-build-only' | sudo -S bash -c '{{.Vars}} bash {{.Path}}'"
    script          = "scripts/setup.sh"
  }

  post-processor "manifest" {
    output     = "output-ova/manifest.json"
    strip_path = true
  }
}
