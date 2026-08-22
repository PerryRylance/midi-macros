import "@xterm/xterm/css/xterm.css";
import { bootWebContainer, installPackage } from "./webcontainer";
import { createTerminal } from "./terminal";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const form = document.querySelector<HTMLFormElement>("#install-form")!;
const input = document.querySelector<HTMLInputElement>("#package-name")!;
const button = document.querySelector<HTMLButtonElement>("#install-button")!;
const terminalContainer = document.querySelector<HTMLDivElement>("#terminal")!;

const terminal = createTerminal(terminalContainer);
const container = await bootWebContainer();

status.textContent = "Ready.";
input.disabled = false;
button.disabled = false;

form.addEventListener("submit", async event => {
    event.preventDefault();

    const name = input.value.trim();

    input.disabled = true;
    button.disabled = true;
    terminal.writeln(`$ npm install ${name}`);

    try {
        const result = await installPackage(container, name, chunk => terminal.write(chunk));

        status.textContent = result.exitCode === 0 ? `Installed ${name}.` : `Failed to install ${name}.`;
    } catch (error) {
        terminal.writeln(error instanceof Error ? error.message : String(error));
        status.textContent = "Error.";
    } finally {
        input.disabled = false;
        button.disabled = false;
    }
});
