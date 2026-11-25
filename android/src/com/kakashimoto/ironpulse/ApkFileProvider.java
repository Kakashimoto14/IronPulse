package com.kakashimoto.ironpulse;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class ApkFileProvider extends ContentProvider {
    public static final String AUTHORITY = "com.kakashimoto.ironpulse.apkprovider";
    public static final String APK_FILENAME = "ironpulse-update.apk";

    public static File getUpdateApkFile(Context context) {
        File dir = new File(context.getFilesDir(), "updates");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return new File(dir, APK_FILENAME);
    }

    public static Uri getUpdateApkUri() {
        return Uri.parse("content://" + AUTHORITY + "/" + APK_FILENAME);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        Context ctx = getContext();
        if (ctx == null) {
            throw new FileNotFoundException("Provider context unavailable");
        }
        File file = getUpdateApkFile(ctx);
        if (!file.exists()) {
            throw new FileNotFoundException("Update APK not found: " + file.getAbsolutePath());
        }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        Context ctx = getContext();
        File file = ctx != null ? getUpdateApkFile(ctx) : null;
        String[] cols = projection != null && projection.length > 0
                ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};

        MatrixCursor cursor = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) {
                row[i] = APK_FILENAME;
            } else if (OpenableColumns.SIZE.equals(cols[i])) {
                row[i] = (file != null && file.exists()) ? file.length() : 0L;
            } else {
                row[i] = null;
            }
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
