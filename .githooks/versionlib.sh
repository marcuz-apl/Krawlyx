#!/bin/sh
VERSION_FILE=VERSION
IDENT_RE='^v[0-9]+\.[0-9]+\.[0-9]+[+-][0-9]{6}[0-9a-z]$'

die() { echo "alfazen-versioning: $*" >&2; exit 1; }
utc_yymmdd() { TZ=UTC LC_ALL=C date -u +%y%m%d; }

read_version() {
  [ -f "$VERSION_FILE" ] || die "root $VERSION_FILE file is missing"
  id=$(tr -d '\r\n\t ' < "$VERSION_FILE")
  [ -n "$id" ] || die "$VERSION_FILE is empty"
  printf '%s\n' "$id"
}

validate_identifier() {
  id=$1
  printf '%s' "$id" | grep -Eq "$IDENT_RE" || die "malformed identifier '$id' in $VERSION_FILE"
  case $id in *+*) build=${id#*+} ;; *-*) build=${id#*-} ;; esac
  bdate=${build%?}
  today=$(utc_yymmdd)
  [ "$bdate" -le "$today" ] || die "future-dated BUILD in '$id'"
}

next_identifier() {
  old=$1; today=$2
  case $old in *+*) ver=${old%+*}; build=${old#*+} ;; *-*) ver=${old%-*}; build=${old#*-} ;; esac
  bdate=${build%?}
  bctr=${build#??????}

  if [ "$bdate" != "$today" ]; then
    nctr=1
  else
    case $bctr in
      [1-8]) nctr=$((bctr + 1)) ;;
      9)     nctr=a ;;
      [a-y]) nctr=$(printf '%s' "$bctr" | tr 'a-y' 'b-z') ;;
      z)     die "daily counter exhausted for $today" ;;
      *)     die "invalid counter '$bctr'" ;;
    esac
  fi
  printf '%s+%s%s\n' "$ver" "$today" "$nctr"
}
