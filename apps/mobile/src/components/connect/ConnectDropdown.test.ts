import fs from 'fs';
import path from 'path';

const read = (...parts: string[]): string => fs.readFileSync(path.join(__dirname, ...parts), 'utf8');

describe('Connect device sheet entry points', () => {
  it('routes Stream to the single app-level sheet, on the app solid dark sheet and not the see-through player glass', () => {
    const dropdown = read('ConnectDropdown.tsx');
    const root = read('../../navigation/RootNavigator.tsx');
    const sheet = read('ConnectDeviceSheet.tsx');

    expect(dropdown).toContain('connect.openDevices()');
    expect(dropdown).toContain('expanded: connect.devicesVisible');
    expect(dropdown).not.toMatch(/ConnectDeviceList|SheetScrollView|<Sheet\b/);
    expect(root.match(/<ConnectDeviceSheet\s*\/>/g) ?? []).toHaveLength(1);
    expect(sheet).toMatch(/<Sheet visible=\{connect\.devicesVisible\}/);
    expect(sheet).not.toContain('PlayerSheet');
  });

  it('is no longer a row of the profile menu: the header button is the one way in from Stream', () => {
    expect(read('../../navigation/profileMenu.ts')).not.toContain("id: 'devices'");
    expect(read('../V6TabBar.tsx')).not.toContain('openDevices');
  });
});
