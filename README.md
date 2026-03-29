# Prayer Notifier JS

Terminal prayer time notifier for Node.js.

## Run

```bash
node prayer_notifier.js
```

On first run it asks for latitude, longitude, and timezone, then saves them in `.state`.

## Features

- Daily prayer times
- Terminal countdown dashboard
- Prayer reminders and repeat notifications
- Mark prayers as done or undo them
- Local state persistence

## Controls

- `d` + `f|d|a|m|i`: mark done
- `u` + `f|d|a|m|i`: undo
- `t`: change theme
- `q` or `Ctrl+C`: quit

## Notes

- Requires Node.js
- Linux notifications use `notify-send`
