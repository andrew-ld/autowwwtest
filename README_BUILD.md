# Building the Add-on

This document outlines the steps required to build the `autowwwleak.zip` package from the source code. The process utilizes Docker and Docker Buildx to ensure a consistent build environment, and the build script specifically requires the `bash` shell interpreter.

## Prerequisites

1.  **Operating System:** A Linux system capable of running Docker.
2.  **Bash Shell:** The build script (`docker-create-zip.sh`) **must** be executed using the `bash` shell.
3.  **Docker:** A recent version of Docker Engine or Docker Desktop is required. The build script specifically uses `docker buildx`, which is included in modern Docker installations.
    - **Installation:** Follow the official Docker installation instructions for your OS: [https://docs.docker.com/engine/install/](https://docs.docker.com/engine/install/)
    - Ensure the Docker daemon is running before proceeding.

## Build Steps

The entire build process is handled by a single script executed with `bash`.

1.  **Navigate to the Root Directory:** Open your terminal or command prompt (ensuring it's a `bash` shell) and change to the root directory of this project's source code (the directory containing the `docker-create-zip.sh` script).

    ```bash
    cd /path/to/your/project-root
    ```

2.  **Execute the Build Script:** Run the `docker-create-zip.sh` script using the `bash` command.

    ```bash
    bash ./docker-create-zip.sh
    ```

    This script will use Docker to build the necessary components and package them.

## Output

Upon successful execution, the script will create a file named `autowwwleak.zip` in the current working directory (the project's root directory). This ZIP file contains the packaged add-on, ready for distribution or submission.
