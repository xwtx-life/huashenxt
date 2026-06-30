# Only apply this hook when compiling the installer, not the uninstaller
!ifndef BUILD_UNINSTALLER
  !ifdef MUI_PAGE_CUSTOMFUNCTION_PRE
    !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_PRE myInstFilesPre

  Function myInstFilesPre
    # Get the length of the current $INSTDIR
    StrLen $1 $INSTDIR
    # Get the length of the folder name to be appended (e.g. "\course-assistant")
    StrLen $2 "\${APP_FILENAME}"
    # If the path length is less than the suffix length, do nothing
    IntCmp $1 $2 0 +5 0
      # Calculate the starting offset of the suffix
      IntOp $3 $1 - $2
      # Get the suffix of $INSTDIR
      StrCpy $4 $INSTDIR "" $3
      # If the suffix matches the folder name, strip it
      StrCmp $4 "\${APP_FILENAME}" 0 +2
        StrCpy $INSTDIR $INSTDIR $3
  FunctionEnd
!endif

# Define customRemoveFiles to safely delete only the installed files and folders.
# This prevents RMDir /r $INSTDIR from deleting the entire parent directory if the user installs to a shared folder.
!macro customRemoveFiles
  Delete "$INSTDIR\${PRODUCT_FILENAME}.exe"
  Delete "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\LICENSE*"
  Delete "$INSTDIR\LICENSES*"
  
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\swiftshader"
  
  # Try to remove the installation directory itself.
  # If there are other user files in the directory, this will fail silently (which is the desired safe behavior).
  RMDir "$INSTDIR"
!macroend
