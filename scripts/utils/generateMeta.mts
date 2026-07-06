/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { promises as fs } from "node:fs";
import { mkdir } from "node:fs/promises";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import xmlFormat from "xml-formatter";

function generateDescription(description: string, descriptionNode: Element) {
    const lines = description.replace(/\r/g, "").split("\n");
    let currentList: Element | null = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes("New Contributors")) {
            // we're done, don't parse any more since the new contributors section is the last one
            break;
        }

        if (line.startsWith("## ")) {
            const pNode = descriptionNode.ownerDocument.createElement("p");
            pNode.textContent = line.slice(3);
            descriptionNode.appendChild(pNode);
        } else if (line.startsWith("* ")) {
            const liNode = descriptionNode.ownerDocument.createElement("li");
            liNode.textContent = line.slice(2).split("in https://github.com")[0].trim(); // don't include links to github

            if (!currentList) {
                currentList = descriptionNode.ownerDocument.createElement("ul");
            }

            currentList.appendChild(liNode);
        }

        if (currentList && !lines[i + 1].startsWith("* ")) {
            descriptionNode.appendChild(currentList);
            currentList = null;
        }
    }
}

const releases = await fetch("https://api.github.com/repos/XenHat/Vesktop-linux-arrpc/releases", {
    headers: {
        Accept: "application/vnd.github+json",
        "X-Github-Api-Version": "2022-11-28"
    }
}).then(res => res.json());

const latestReleaseInformation = releases[0];

let metaInfo = await (async () => {
    for (const release of releases) {
        const metaAsset = release.assets.find((a: any) => a.name === "dev.vencord.Vesktop.metainfo.xml");
        if (metaAsset) return fetch(metaAsset.browser_download_url).then(res => res.text());
    }
})();

if (!metaInfo) {
    // Try upstream releases as fallback
    const upstreamReleases = await fetch("https://api.github.com/repos/Vencord/Vesktop/releases", {
        headers: {
            Accept: "application/vnd.github+json",
            "X-Github-Api-Version": "2022-11-28"
        }
    }).then(res => res.json() as any);

    for (const release of upstreamReleases) {
        const metaAsset = release.assets.find((a: any) => a.name === "dev.vencord.Vesktop.metainfo.xml");
        if (metaAsset) {
            metaInfo = await fetch(metaAsset.browser_download_url).then(res => res.text());
            break;
        }
    }

    if (!metaInfo) {
        console.log("No existing meta information found, creating fresh metainfo.xml");
        metaInfo = `<?xml version="1.0" encoding="utf-8"?>
<component type="desktop-application">
  <id>dev.vencord.Vesktop</id>
  <name>Vesktop</name>
  <summary>Customizable Discord client</summary>
  <developer_name>Vencord Contributors</developer_name>
  <launchable type="desktop-id">dev.vencord.Vesktop.desktop</launchable>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>GPL-3.0-or-2</project_license>
  <project_group>Vencord</project_group>
  <releases/>
</component>`;
    }
}

const parser = new DOMParser().parseFromString(metaInfo, "text/xml");

const releaseList = parser.getElementsByTagName("releases")[0];

for (let i = 0; i < releaseList.childNodes.length; i++) {
    const release = releaseList.childNodes[i] as Element;

    if (release.nodeType === 1 && release.getAttribute("version") === latestReleaseInformation.name) {
        console.log("Latest release already added, nothing to be done");
        process.exit(0);
    }
}

const release = parser.createElement("release");
release.setAttribute("version", latestReleaseInformation.name);
release.setAttribute("date", latestReleaseInformation.published_at.split("T")[0]);
release.setAttribute("type", "stable");

const releaseUrl = parser.createElement("url");
releaseUrl.textContent = latestReleaseInformation.html_url;

release.appendChild(releaseUrl);

const description = parser.createElement("description");

// we're not using a full markdown parser here since we don't have a lot of formatting options to begin with
generateDescription(latestReleaseInformation.body, description);

release.appendChild(description);

releaseList.insertBefore(release, releaseList.childNodes[0]);

const output = xmlFormat(new XMLSerializer().serializeToString(parser), {
    lineSeparator: "\n",
    collapseContent: true,
    indentation: "  "
});

await mkdir("./dist", { recursive: true });
await fs.writeFile("./dist/dev.vencord.Vesktop.metainfo.xml", output, "utf-8");

console.log("Updated meta information written to ./dist/dev.vencord.Vesktop.metainfo.xml");
