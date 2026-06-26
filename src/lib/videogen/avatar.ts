import { initialsFor } from "./text";
import type { Participant } from "./job";

function githubAvatar(login: string): string {
  return `https://github.com/${login}.png?size=256`;
}

export function setAvatar(el: HTMLElement, p: Participant) {
  el.innerHTML = "";
  const url = p.avatar ?? (p.github ? githubAvatar(p.github) : null);
  if (url) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = p.name;
    img.onerror = () => {
      el.innerHTML = "";
      const span = document.createElement("span");
      span.textContent = initialsFor(p.name);
      el.appendChild(span);
    };
    el.appendChild(img);
  } else {
    const span = document.createElement("span");
    span.textContent = initialsFor(p.name);
    el.appendChild(span);
  }
}
