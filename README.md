# kisara-bot

这个 Bot 是 Windows 中文环境专用的。

```powershell
git clone --recurse-submodules git@github.com:dsrkafuu/kisara-bot.git

cd .\NapCatQQ
bun install

cd .\kisara-bot
bun install

python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

bun run dev
```
