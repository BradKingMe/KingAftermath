// All names, paths and computer identities in this example are fictional.
const record = (id, name, source, fields) => ({ id, name, source, fields });
const app = record('lm/64/uninstall/notepad', 'Notepad++', 'LocalMachine/Registry64/Uninstall/Notepad++', { Version: '8.7', Publisher: 'Notepad++ Team', InstallLocation: 'C:\\Program Files\\Notepad++' });
const sync = record('cu/64/run/desksync', 'DeskSync', 'CurrentUser/Registry64/Run', { Command: '"C:\\Users\\Demo\\AppData\\Local\\DeskSync\\sync.exe" --background' });
const spooler = record('spooler', 'Print Spooler', 'CIM:Win32_Service', { ServiceName: 'Spooler', Executable: 'C:\\Windows\\System32\\spoolsv.exe', StartMode: 'Auto', Account: 'LocalSystem' });
const backup = record('\\backup\\weekly', 'Weekly backup', '\\Backup\\', { Actions: String.raw`[{"Execute":"C:\\Tools\\backup.exe","Arguments":"--weekly"}]`, Enabled: 'True', Account: 'DEMO\\Operator' });
const added = {
  apps: [record('lm/64/uninstall/asterdesk', 'AsterDesk', 'LocalMachine/Registry64/Uninstall/AsterDesk', { Version: '2.4.0', Publisher: 'Aster Software (fictional)', InstallLocation: 'C:\\Program Files\\AsterDesk', UninstallCommand: '"C:\\Program Files\\AsterDesk\\uninstall.exe"' })],
  startup: [record('cu/64/run/astertray', 'AsterDesk tray', 'CurrentUser/Registry64/Run', { Command: '"C:\\Program Files\\AsterDesk\\tray.exe" --startup', RegistryType: 'String' }), record('cu/64/run/asterupdate', 'AsterDesk update agent', 'CurrentUser/Registry64/Run', { Command: '"C:\\Users\\Demo\\AppData\\Local\\AsterDesk\\update.exe" --check', RegistryType: 'String' })],
  services: [record('asterdeskservice', 'AsterDesk background service', 'CIM:Win32_Service', { ServiceName: 'AsterDeskService', Executable: '"C:\\Program Files\\AsterDesk\\service.exe"', StartMode: 'Auto', Account: 'LocalSystem' })],
  tasks: [record('\\asterdesk\\update', 'AsterDesk update', '\\AsterDesk\\', { Actions: String.raw`[{"Execute":"C:\\Program Files\\AsterDesk\\update.exe","Arguments":"--silent"}]`, Enabled: 'True', RunLevel: 'Highest' }), record('\\asterdesk\\usage', 'AsterDesk usage summary', '\\AsterDesk\\', { Actions: String.raw`[{"Execute":"C:\\Users\\Demo\\AppData\\Local\\AsterDesk\\usage.exe","Arguments":"--daily"}]`, Enabled: 'True', RunLevel: 'Limited' })]
};
export function demoSnapshots() {
  const make = (id, label, time, items) => ({ format: 'kingaftermath.snapshot', version: 1, collector: 'windows-0.1.0', id, label, capturedAt: `2026-10-23T${time}:00Z`, machine: { id: 'fictional-workstation', userId: 'fictional-demo-user', name: 'DEMO-WORKSTATION', os: 'Windows 11 (fictional example)', scope: 'windows64-current-user-and-machine-v1' }, sections: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { status: 'complete', warnings: [], items: v }])) });
  const changedSpooler = { ...spooler, fields: { ...spooler.fields, StartMode: 'Manual' } };
  return JSON.parse(JSON.stringify([
    make('demo-before', 'Before AsterDesk install', '14:00', { apps: [app], startup: [sync], services: [spooler], tasks: [backup] }),
    make('demo-installed', 'After AsterDesk install', '14:06', { apps: [app, ...added.apps], startup: [sync, ...added.startup], services: [changedSpooler, ...added.services], tasks: [backup, ...added.tasks] }),
    make('demo-uninstalled', 'After AsterDesk uninstall', '14:12', { apps: [app], startup: [sync, added.startup[1]], services: [changedSpooler], tasks: [backup, added.tasks[1]] })
  ])).map((snapshot,index) => {
    snapshot.version=2; snapshot.collector='windows-0.2.0';
    snapshot.tracking=['c:\\program files\\asterdesk'];
    snapshot.machine.scope='fictional-windows64-v2-with-targets-and-folder';
    const program=record('c:\\program files\\asterdesk\\program.exe','program.exe','c:\\program files\\asterdesk',{FilePath:'C:\\Program Files\\AsterDesk\\program.exe',Size:'24000',SHA256:'a'.repeat(64),HashStatus:'hashed'});
    const cache=record('c:\\program files\\asterdesk\\cache.log','cache.log','c:\\program files\\asterdesk',{FilePath:'C:\\Program Files\\AsterDesk\\cache.log',Size:'128',SHA256:'b'.repeat(64),HashStatus:'hashed'});
    snapshot.sections.files={status:'complete',warnings:[],items:index===0?[]:index===1?[program,cache]:[cache]};
    for(const category of ['startup','services','tasks']) for(const item of snapshot.sections[category].items) {
      const command=item.fields.Command ?? item.fields.Executable ?? '';
      const taskPath=category==='tasks' ? JSON.parse(item.fields.Actions)[0].Execute : '';
      const path=taskPath || command.match(/^"([^"]+)"/)?.[1] || command.split(' --')[0];
      const missing=index===2 && item.name.startsWith('AsterDesk');
      item.targets=[{input:command || taskPath,path,status:missing?'missing':'exists',reason:missing?'Fictional example: executable was removed during uninstall.':'Fictional example: local executable existed at capture time.'}];
    }
    return snapshot;
  });
}
