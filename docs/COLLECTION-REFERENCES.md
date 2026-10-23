# Collection references

The collector's scope is intentionally narrow and transparent. Relevant Microsoft documentation:

- [Run and RunOnce registry keys](https://learn.microsoft.com/en-us/windows/win32/setupapi/run-and-runonce-registry-keys)
- [Uninstall registry properties](https://learn.microsoft.com/en-us/windows/win32/msi/uninstall-registry-key)
- [32-bit and 64-bit registry views](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/view-system-registry-with-64-bit-windows)
- [Get-ScheduledTask](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/get-scheduledtask)
- [Win32_Service](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-service)
- [RegistryKey.OpenBaseKey](https://learn.microsoft.com/en-us/dotnet/api/microsoft.win32.registrykey.openbasekey)

The app reads uninstall registration rather than invoking an installer inventory provider. A registration is evidence of a registry entry, not proof that application files still exist. Run/RunOnce entries are configuration observations, not proof that Windows ran them. Service command lines and task actions are displayed as evidence and never executed.
