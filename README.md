# AutoWWWTest

**Automatically discover potential security issues on the websites you visit.**

AutoWWWTest is a browser extension designed to passively analyze web traffic and content in the background, identifying common security misconfigurations and potential vulnerabilities without requiring active scanning. Its plugin-based architecture allows for easy extension with new detection modules.

## Installation

Follow these steps to install the AutoWWWTest Firefox extension:

1.  **Navigate to the Releases Page:**
    Open your Firefox browser and go to the official releases page for the project on GitHub:
    [https://github.com/andrew-ld/autowwwtest/releases/](https://github.com/andrew-ld/autowwwtest/releases/)

2.  **Download the Extension File:**

    - Find the latest release (usually the topmost entry on the page).
    - Look for the "Assets" section within that release.
    - Click on the file ending with the `.xpi` extension (e.g., `autowwwtest-x.y.z.xpi`).

3.  **Install the Extension:**

    - Firefox will prompt you with a security warning and ask for permission to install the extension from this source.
    - Click **"Continue to installation"** to proceed with the installation
    - Click **"Add"** to ultimate with the installation.

4.  **Confirmation:**
    Once installed, you should see a confirmation message from Firefox, and the extension icon might appear in your toolbar.

## Building the Add-on

To build the add-on package from the source code, please refer to the detailed instructions located in the following file:

**[Detailed Build Instructions](README_BUILD.md)**

## Features

- **Passive Analysis:** Automatically checks websites as you browse.
- **Plugin Architecture:** Easily add or remove specific security checks.
- **Common Issue Detection:** Identifies known patterns for common web security issues.
- **Configurable Notifications:** Choose between silent background logging or regular desktop notifications.
- **Rate Limiting:** Prevents excessive notifications for repeated issues on the same site.
- **Per-Plugin Settings:** Fine-tune the behavior of individual detection modules.

## How it Works

The extension utilizes the browser's web request APIs to intercept and analyze HTTP requests and responses. Relevant details are passed to enabled plugins, which check for specific security issues. Findings can trigger notifications or be logged silently, respecting configured rate limits.

## Included Plugins

AutoWWWTest currently includes the following detection plugins:

### 1. CorsMisconfig

- **ID:** `CorsMisconfig`
- **Description:** Detects common Cross-Origin Resource Sharing (CORS) misconfigurations in HTTP headers, such as overly permissive `Access-Control-Allow-Origin` values (like `*` or `null`), which can lead to unauthorized cross-domain data access.

### 2. OpenRedirect

- **ID:** `OpenRedirect`
- **Description:** Identifies HTTP redirects (3xx status codes) that lead from the current website to a different top-level domain based on the `Location` header. Unvalidated external redirects can be exploited in phishing attacks.

### 3. SecretsLeak

- **ID:** `SecretsLeak`
- **Description:** Scans the content of JavaScript files for patterns resembling sensitive secrets like API keys or tokens using regular expressions. Exposing secrets in client-side code can grant attackers unauthorized access.

### 4. DotfilesLeak

- **ID:** `DotfilesLeak`
- **Description:** Probes for commonly exposed configuration or version control system files (e.g., `.git/HEAD`, `.env`, `.svn/wc.db`). Public accessibility of these "dotfiles" can leak sensitive information like repository structure, environment variables, or database details, potentially leading to further exploitation.

### 5. DomainTakeover

- **ID:** `DomainTakeover`
- **Description:** Monitors requests initiated by the visited website to external domains. If a request targets a domain that appears to be unregistered or expired, it flags a potential domain takeover (or subdomain takeover) vulnerability. An attacker could potentially register the target domain to serve malicious content or intercept data intended for that domain.
