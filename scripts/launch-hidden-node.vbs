Option Explicit

If WScript.Arguments.Count <> 3 Then WScript.Quit 1

Dim shell
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = WScript.Arguments.Item(2)
shell.Run Chr(34) & WScript.Arguments.Item(0) & Chr(34) & " " & Chr(34) & WScript.Arguments.Item(1) & Chr(34), 0, False
