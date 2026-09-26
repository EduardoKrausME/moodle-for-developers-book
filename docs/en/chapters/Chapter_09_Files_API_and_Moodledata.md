{% raw %}

# 9. Files API and Moodledata

![Files API and moodledata](image/cap09-files-api-moodledata.png)

If you open the moodledata directory of an installation and enter filedir expecting a structure resembling courses, activities, users, and filenames, the first impression is usually that something went wrong. Instead of folders with understandable names, you find directories such as 08/13 and, inside them, files called 081371cb102fa559e81993fddc230c79205232ce. There is no final-report.pdf, profile-photo.jpg, or lesson-material-3.zip. There is a collection of hashes that, when viewed only from disk, seems unrelated to what the user sees in Moodle.

This is not disorganization, much less a strange aesthetic choice. It is exactly the opposite. Moodle separates the logical identity of a file from the physical way its content is stored, and this separation enables deduplication, component-based access control, consistent backup and restore, Unicode names, alternative storage, and even object storage without requiring every plugin to know the infrastructure where the bytes actually live. Once you understand this architecture, the Files API stops looking like a bureaucratic layer around file_put_contents() and starts making a great deal of sense.

The classic mistake for developers coming to Moodle from simpler PHP applications is thinking of files as paths. The code receives an upload, chooses a directory, and writes something to /uploads/user/file.pdf. It works until permissions, renaming, copying, course backup, a multi-server cluster, deduplication, restore on another site, S3 storage, and the need to know whether that file belongs to forum 14, user 32, or course material 7 appear. The Files API exists to remove this responsibility from each plugin and centralize the relationship among content, metadata, and access.

In this chapter I will use a recurring example called mod_biblioteca, a fictitious activity with private documents per record. The name is irrelevant, but the problem is real because we need to create files, list files, allow editing, work with draft areas, generate URLs, and prevent a student from altering the address and downloading the document from another record. Once this flow is clear, practically the entire Files API becomes much more predictable.

## 9.1 Moodledata - revisiting Chapter 1

In Chapter 1 we already saw that `$CFG->dataroot` points to the installation data directory and that this directory must not be published directly by the web server. Here we need to go further because moodledata is not simply "the folder where uploads live." It brings together areas with completely different characteristics, some permanent and others disposable, some shared in a cluster and others suitable for local storage on each node.

The `filedir` directory stores file content controlled by the Files API when Moodle uses the standard filesystem. Meanwhile, `temp`, `cache`, `localcache`, `sessions`, `trashdir`, and other areas have specific purposes and do not follow exactly the same logic. This matters because putting everything into the same mental bucket called "Moodle files" leads to poor decisions, such as synchronizing `localcache` across servers or treating `temp` as permanent content.

Another important detail is that the Files API does not manage absolutely everything inside `$CFG->dataroot`. Moodle's internal documentation clearly separates site content, which goes through File Storage and File System, from internal directories used by the system itself. In other words, `moodledata/filedir` is part of the Files API architecture, while several other dataroot directories exist for cache, sessions, temporary processing, or internal components.

## 9.2 filedir

`filedir` is the default physical pool where Moodle stores the bytes of permanent files controlled by the Files API. The word pool is useful because the same content can be used in several places in Moodle without needing multiple physical copies on disk. What distinguishes those uses is not another physical copy, but separate records in the `files` table.

If a file's content hash is `081371cb102fa559e81993fddc230c79205232ce`, the default backend uses the first four characters to distribute the file across directories and reaches something like `moodledata/filedir/08/13/081371cb102fa559e81993fddc230c79205232ce`. This avoids dumping millions of objects into one directory and keeps the physical name directly related to the content.

This gives us a rule worth repeating several times in this chapter: the name the user sees is not the physical object name in `filedir`. The visible name is stored in Files API metadata, while the physical content is identified by `contenthash`. If you try to find `trabalho-final.pdf` using `find` inside `filedir`, you are looking for the right thing in the wrong place.

## 9.3 Why you must not modify filedir manually

Entering `moodledata/filedir`, copying a file there, and expecting it to appear in Moodle does not work because the File System stores bytes, but File Storage gives a file its logical identity. Without the corresponding record in `{files}`, Moodle does not know the context, component, filearea, itemid, virtual path, name, MIME type, author, or relationship between that content and the rest of the system.

The reverse operation is even worse. If you locate a hash in `filedir` and simply delete it, you may break several uses at once because the same `contenthash` can be referenced by multiple records. The deduplication that saves space also means the physical file does not belong exclusively to the row you were looking at.

Editing the content in place is a particularly bad idea. The physical name is the SHA1 of the content, so changing the bytes without changing the name breaks the storage invariant itself. The database continues saying that the file has a certain `contenthash`, but the content no longer matches that hash. Core documentation even shows that, with the default backend, you can use `sha1sum` to validate corruption by comparing the calculated hash with the physical name. If you edit the file manually, you have manufactured corruption.

## 9.4 The files table and the famous mdl_files

On installations using the default prefix you will see the table as `mdl_files`, but do not write that name in plugin code. The correct form remains `{files}`, allowing the DML API to apply the installation's configured prefix. I mention `mdl_files` here only because that is how many people first encounter the table when opening the database.

The `files` table has one row for each logical use of a file. That sentence matters. It is not one row for each physical content object stored and it is not merely a table pointing to a directory. The same image used as an avatar and also inside a post can produce two separate records, with different `contextid`, `component`, `filearea`, `itemid`, `filepath`, and `filename`, while both records share the same `contenthash` and therefore the same physical content.

This explains why looking only at `contenthash` to discover "who owns the file" makes no sense. The contenthash answers which content it is, not which use it represents. Logical identity is defined by the set of fields locating the file inside a file area.

## 9.5 What actually exists in files

When you inspect the `files` table, you find fields related to logical identity, content, and auxiliary metadata. The ones you will encounter most frequently in plugin development are `contextid`, `component`, `filearea`, `itemid`, `filepath`, `filename`, `contenthash`, `pathnamehash`, `filesize`, `mimetype`, `timecreated`, `timemodified`, `userid`, `author`, `license`, `source`, `sortorder`, and information related to external references.

This does not mean your plugin should manually build an INSERT into that table. That is almost always wrong. The Files API calculates hashes, normalizes paths, creates directory entries, handles references, and talks to the physical backend. Understanding the table is important for diagnostics and architecture, not as permission to bypass `file_storage` and write directly to the database.

A good practical rule is this: querying `{files}` for diagnostic purposes can be useful, but creating, moving, copying, or deleting files should go through the appropriate APIs. If you catch yourself writing `INSERT INTO {files}`, stop and first look for the corresponding method in `file_storage`.

## 9.6 contenthash

`contenthash` identifies the file content. In the default filesystem, Moodle calculates SHA1 over the bytes and uses that value as the physical object key. Two files with exactly the same content produce the same `contenthash` even if they have different names, belong to different users, and live in completely different fileareas.

This is where deduplication comes from. If teacher A uploads `apostila.pdf` and teacher B uploads `material.pdf`, but both files contain identical bytes, File Storage can create two logical records while File System keeps a single physical copy of the content. To the application there are two files; to storage there is one shared physical object.

Do not confuse this with authorization. Knowing the hash grants no access rights and does not replace context, capability, or the rules in the `pluginfile()` callback. The contenthash is the identity of content in the storage layer, not a secret token.

## 9.7 pathnamehash

If `contenthash` answers "which content is this?", `pathnamehash` answers "which logical file is this?". Core calculates SHA1 over a string built from `contextid`, `component`, `filearea`, `itemid`, `filepath`, and `filename`. In the current implementation, the form is equivalent to `sha1("/$contextid/$component/$filearea/$itemid" . $filepath . $filename)`.

This makes `pathnamehash` an efficient way to locate a complete logical identity without comparing each column individually. The `file_storage::get_file()` method receives the readable fields, calculates pathnamehash, and can internally locate the corresponding record.

It also explains why manually changing `component`, `filearea`, `filepath`, or `filename` in the database while forgetting to recalculate `pathnamehash` breaks consistency. Once again, this is exactly the kind of problem that disappears when you use the API instead of editing `{files}` directly.

## 9.8 Deduplication

Moodle deduplicates by content, not by filename. This choice is much more powerful than it may first appear because names are presentation metadata and can change without requiring a new copy of the bytes. A teacher can rename `aula.pdf` to `material-semana-1.pdf` while the `contenthash` remains exactly the same.

In practice this significantly reduces the cost of internal copies. Operations such as content duplication, draft areas, and reuse can create new logical references without necessarily duplicating bytes in storage. In large environments this stops being an architectural detail and starts representing disk space, traffic, and processing time.

Deduplication is also another reason never to treat an object in `filedir` as exclusive property of your plugin. Your record may disappear while physical content remains because another reference still uses the same hash, or the physical content may only be removed once no valid reference still depends on it.

## 9.9 contextid

`contextid` connects the file to Moodle's context model. A profile image normally lives in a user context, an Activity Module file usually lives in `context_module`, while files associated with global configuration may live in `context_system`. This choice should not be based solely on whichever number is easiest to obtain because context influences authorization, backup, restore, and content lifecycle.

In our `mod_biblioteca`, documents belonging to a specific activity instance should normally use module context. This means that when the activity is duplicated or restored, Moodle has enough information to associate those files with the correct component. Storing everything in system context because "it's simpler" is the Files API equivalent of using `context_system` for every capability: it works until it starts colliding with the rest of the architecture.

## 9.10 component

`component` is the Frankenstyle name of the component owning the filearea, for example `mod_biblioteca`, `local_meuplugin`, `block_exemplo`, or `user`. Current documentation reinforces that a component should access its own fileareas and, when it needs to work with files from another component, should use the API exposed by that component instead of directly searching through somebody else's storage.

This rule avoids invisible coupling. If `local_relatorio` starts directly fetching internal files from `mod_assign` using component and filearea values observed in the database, the code now depends on Assignment implementation details. It may work today and break when the other component changes its organization or authorization rules.

## 9.11 filearea

`filearea` separates different purposes within the same component. A plugin may have, for example, `attachment`, `content`, `certificate`, `evidence`, and `thumbnail`, each representing its own functional contract. The name is not merely a pretty folder and there is no separate table registering every possible area. Areas exist implicitly through current file records and callbacks implemented by the plugin.

Prefer simple, stable names because filearea usually appears in backup, restore, `pluginfile()`, forms, and URLs. Changing the name after the plugin is in production requires a real migration of records and possibly updates to content referencing `@@PLUGINFILE@@`. It is a small decision that gains weight over time.

## 9.12 itemid

`itemid` allows the same filearea to contain independent subsets. If the plugin has one document per record in the `biblioteca_item` table, the `itemid` can be that record's id. All files remain in the same context, component, and filearea, while each business object gets its own logical container.

When there is only one set of files per context and filearea, using `0` is common. There is no merit in inventing a different itemid unnecessarily, but do not use `0` when you genuinely need to separate objects. If dozens of records share the same area without distinction, deleting the files for one record or validating ownership in `pluginfile()` becomes much harder.

## 9.13 filepath

`filepath` is a virtual path and must begin and end with `/`. The root path is simply `/`, while a file in a logical structure may use something like `/2026/documentos/`. This does not mean a physical `2026/documentos` directory exists inside `filedir`. The path is part of the file's logical identity.

Directories are also represented within the Files API, and records whose `filename` is `.` represent directories. You normally do not need to create these records manually because storage handles them as files are added.

## 9.14 filename

`filename` is the name that makes sense to the application and user, not the physical object name. It can contain Unicode and be completely different from the hash used in storage. This abstraction lets the File System remain simple and predictable while the logical layer keeps friendly names.

When receiving names from external sources, keep using the appropriate APIs and validation. Do not take a filename from the request and concatenate it into a disk path, because then you abandon exactly the guarantees the Files API provides and reopen path traversal problems and inconsistencies between metadata and content.

## 9.15 File areas

A file area can be understood as a virtual bucket identified primarily by `contextid`, `component`, `filearea`, and `itemid`. Inside that bucket there are `filepath` and `filename`, forming the structure the user perceives. This mental model is much better than thinking in physical directories because it remains valid even when no local disk exists at all.

In `mod_biblioteca`, for example, we could have `contextid=381`, `component=mod_biblioteca`, `filearea=document`, `itemid=72`, `filepath=/`, and `filename=contrato.pdf`. The physical file may live in `moodledata/filedir`, S3, DigitalOcean Spaces, or another backend. For the plugin, the identity remains the same.

## 9.16 get_file_storage()

`get_file_storage()` returns the `file_storage` instance, which is the entry point for most low-level operations. You use this object to create files, locate files, list areas, copy content, and remove records without knowing where the bytes are actually stored.

That is exactly why code that skips this layer should raise suspicion. If the goal is manipulating a file that belongs to Moodle content and the first thing you see is `$CFG->dataroot . '/filedir/'`, the architecture has usually already started in the wrong direction.

```php
$fs = get_file_storage();

$file = $fs->get_file(
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    '/',
    'contrato.pdf'
);
```

## 9.17 stored_file

File Storage read methods return `stored_file` objects. Think of one as the representation of a logical file already known by Moodle. The object exposes metadata such as filename, filepath, mimetype, size, contextid, component, filearea, itemid, contenthash, and also operations such as reading content, copying, deleting, and obtaining handles.

`stored_file` is an especially important abstraction with alternative backends. Your code can call `$file->get_content()` or pass the object to `send_stored_file()` without knowing whether the backend is reading a local file, retrieving a remote object, or using another strategy. This ignorance is an architectural quality, not a limitation.

## 9.18 create_file_from_string()

When content originates inside the plugin itself, `create_file_from_string()` is a natural way to put it into File Storage. A generated CSV report, export JSON, or system-produced text can be saved without first creating a temporary file only to import it afterward.

The important point is correctly preparing the `filerecord`. Fields identifying the filearea are not decorative details. They determine where the file logically exists and how it will be retrieved later.

```php
$fs = get_file_storage();

$filerecord = [
    'contextid' => $context->id,
    'component' => 'mod_biblioteca',
    'filearea' => 'export',
    'itemid' => $item->id,
    'filepath' => '/',
    'filename' => 'exportacao.csv',
];

$file = $fs->create_file_from_string($filerecord, $csv);
```

## 9.19 create_file_from_pathname()

`create_file_from_pathname()` is useful when content already exists in a real file, normally a temporary one created by another processing stage. The Files API reads that pathname, calculates the necessary metadata, and incorporates content into storage.

The source pathname may disappear afterward because the permanent file now belongs to File Storage. Do not use this method as an excuse to build a second permanent tree alongside the Files API. The temporary directory is a processing stage, not the file's new permanent home.

```php
$file = $fs->create_file_from_pathname(
    $filerecord,
    $CFG->tempdir . '/biblioteca/relatorio.pdf'
);
```

## 9.20 create_file_from_storedfile()

When the source is already another `stored_file`, use `create_file_from_storedfile()`. This method is especially useful because it can create a new logical identity pointing to the same content without requiring your code to download and rewrite bytes unnecessarily.

It is common in internal copies, record cloning, and movement between areas. Instead of `$origem->get_content()` followed by `create_file_from_string()`, let File Storage perform the operation at the correct level.

```php
$novo = $fs->create_file_from_storedfile(
    [
        'contextid' => $context->id,
        'component' => 'mod_biblioteca',
        'filearea' => 'archive',
        'itemid' => $item->id,
        'filepath' => '/',
        'filename' => $origem->get_filename(),
    ],
    $origem
);
```

## 9.21 get_file()

`get_file()` is a direct lookup by complete logical identity. You provide context, component, filearea, itemid, filepath, and filename and receive a `stored_file` or `false`. This is the method that usually appears inside `pluginfile()` callbacks after the plugin has already validated which record the user may access.

Notice how the API forces code to be explicit. That is good. A lookup receiving only filename would be far too ambiguous, while the complete set links the file to the correct object and reduces the chance of accidentally serving content from another area.

## 9.22 get_area_files()

`get_area_files()` returns files in a filearea and can limit by itemid. It is useful when you need to build a listing, check whether an area has content, or process files belonging to a record.

One detail often surprises beginners: the method can include directory records, so in many cases you will pass `false` as `includedirs` when you only want files. Think about volume as well. Fetching thousands of `stored_file` objects merely to discover whether at least one exists is wasteful. Use the API that matches the question you are actually trying to answer.

```php
$files = $fs->get_area_files(
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    'filename ASC',
    false
);
```

## 9.23 Virtual directories

Folders displayed in filemanager do not necessarily correspond to physical directories. They are part of the logical namespace defined by `filepath`. This allows the same organization to continue working in a backend that does not even have a folder concept like a POSIX filesystem.

This is another reason not to call `is_dir()` or `scandir()` on `filedir`. You would be inspecting the physical organization of the pool, which exists for storage, while the user and plugin work with a completely different logical hierarchy.

## 9.24 Filepicker

`filepicker` is appropriate when the form needs to receive a file for a one-off operation. It integrates selection with Moodle repositories and puts the file into the user's draft area. At that point the file is not yet in your plugin's permanent filearea.

This difference between selecting and saving is fundamental. The form component handles the upload experience, but your business rule remains responsible for moving or saving content from the draft area to its final destination at the correct time.

## 9.25 Filemanager

`filemanager` works better when a user needs to manage a set of files, including adding, removing, and reorganizing content. As with filepicker, editing happens in a draft area and is only later consolidated into the permanent area.

In Chapter 7 we saw the form elements. Here the important point is understanding what exists behind them. When you open an existing record for editing, Moodle does not expose the permanent filearea directly for the browser to modify. It prepares a logical copy in the user's draft area, the user works there, and on submit the resulting set is synchronized back.

## 9.26 Draft areas

A draft area is a temporary filearea in component `user`, normally in user context, used while content is being edited. Each draft receives an `itemid` identifying that temporary set. This solves important problems because the user can add and remove files before confirming the change without immediately touching official content.

It also improves security and isolation. A file uploaded during editing should not automatically appear to other users before the record is saved and before business rules validate the operation. While in draft, the content belongs to that user's editing flow.

Do not treat draft as permanent storage. Temporary areas are cleaned by Moodle and are part of the editing lifecycle. If your plugin saves only the draftitemid in the database and never performs consolidation, sooner or later you will discover that you persisted a reference to something that was never permanent.

## 9.27 file_prepare_draft_area()

When editing an existing record, you normally need to copy permanent files into a draft area. `file_prepare_draft_area()` performs this work and also participates in URL rewriting when editor content is involved.

The typical flow obtains a draftitemid, prepares the area using current files, and places that id into the form field. The user sees an editable copy of current state rather than directly modifying permanent storage.

```php
$draftitemid = file_get_submitted_draft_itemid('documents');

file_prepare_draft_area(
    $draftitemid,
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    [
        'subdirs' => false,
        'maxfiles' => 20,
    ]
);

$item->documents = $draftitemid;
```

## 9.28 file_save_draft_area_files()

After a valid submission, `file_save_draft_area_files()` takes the final draft-area set into the permanent filearea. This includes new files, removed files, and user changes within the rules configured for that area.

The order of your business operation matters. In many cases you need to insert the database record first to discover the permanent `itemid` and only then save files. This is why forms with filemanager often have a slight difference between creation and editing flows.

```php
file_save_draft_area_files(
    $data->documents,
    $context->id,
    'mod_biblioteca',
    'document',
    $item->id,
    [
        'subdirs' => false,
        'maxfiles' => 20,
    ]
);
```

## 9.29 Editor and @@PLUGINFILE@@

The HTML editor adds another problem because text stored in the database may contain images and other embedded files. Saving the site's complete absolute URL would be terrible for backup, restore, domain changes, and copying between environments. Moodle solves this by storing relative references beginning with `@@PLUGINFILE@@`.

Imagine a teacher inserts an image into a description. During editing they need a real `draftfile.php` URL to see the image, but when content is persisted the address becomes something like `@@PLUGINFILE@@/diagramas/fluxo.png`. That text can travel to another domain without carrying the old hostname with it.

When content is displayed, the placeholder is rewritten back into a servable `pluginfile.php` URL. This back-and-forth may look cumbersome until you imagine what would happen if thousands of content records stored absolute URLs and the site changed address.

## 9.30 file_rewrite_pluginfile_urls()

`file_rewrite_pluginfile_urls()` transforms placeholders in stored content into actual URLs that the browser can request. You provide the service base, context, component, filearea, and itemid.

Do not manually `str_replace('@@PLUGINFILE@@', ...)`. The helper knows Moodle encoding rules and URL formats and keeps your code aligned with the rest of the system.

```php
$text = file_rewrite_pluginfile_urls(
    $item->description,
    'pluginfile.php',
    $context->id,
    'mod_biblioteca',
    'description',
    $item->id
);
```

## 9.31 pluginfile.php

`pluginfile.php` is one of the central pieces of the Files API because it prevents protected files from needing to be publicly accessible in the web root. The browser requests a Moodle-controlled URL, core interprets context, component, filearea, and arguments, then delegates to the responsible component for the final serve-or-deny decision.

The major consequence is that the bucket or disk where bytes live does not alone determine who can read the content. Authorization belongs to the application. A private file can remain private because the callback checks login, context, capability, ownership, groups, visibility, and any specific rule before calling `send_stored_file()`.

## 9.32 Callback [component]_pluginfile()

For a plugin's own fileareas, the component normally implements `[component]_pluginfile()` in `lib.php`. This is one of those callbacks that legitimately remain in `lib.php` because core needs to locate it by convention. The fact that Chapter 3 advocates keeping `lib.php` small does not mean hiding required callbacks inside classes where Moodle cannot find them.

The callback receives context, filearea, path arguments, and other information, but should not trust those values merely because they were constructed by `moodle_url::make_pluginfile_url()`. The client controls URLs. You need to reconstruct the relationship with the real record and validate access again.

## 9.33 Access control in pluginfile()

The most dangerous mistake in `pluginfile()` is using file existence as authorization. Finding a record in `file_storage` proves the file exists, not that the current user may see it. The callback must first answer whether that person may access the business object referenced by itemid.

In our example, receiving `itemid=72` and looking up document area 72 is not enough. We first load record 72 from the plugin, confirm it belongs to the current activity instance, apply `require_login()` to the corresponding course and cm, and check the capability or visibility rule. Only then do we look up the file.

```php
function mod_biblioteca_pluginfile(
    $course,
    $cm,
    $context,
    string $filearea,
    array $args,
    bool $forcedownload,
    array $options = []
): bool {
    global $DB;

    if ($context->contextlevel !== CONTEXT_MODULE) {
        return false;
    }

    if ($filearea !== 'document') {
        return false;
    }

    require_login($course, true, $cm);
    require_capability('mod/biblioteca:view', $context);

    $itemid = (int) array_shift($args);
    $item = $DB->get_record('biblioteca_item', ['id' => $itemid], '*', MUST_EXIST);

    if ((int) $item->bibliotecaid !== (int) $cm->instance) {
        return false;
    }

    $filename = array_pop($args);
    $filepath = empty($args) ? '/' : '/' . implode('/', $args) . '/';

    $fs = get_file_storage();
    $file = $fs->get_file(
        $context->id,
        'mod_biblioteca',
        'document',
        $itemid,
        $filepath,
        $filename
    );

    if (!$file || $file->is_directory()) {
        return false;
    }

    send_stored_file($file, DAY_SECS, 0, true, $options);
}
```

## 9.34 send_stored_file()

After all checks have passed, `send_stored_file()` handles content delivery and details related to caching, range requests, and headers. Avoid reinventing streaming with `readfile()` when the file is in the Files API. Besides duplicating core work, you can break alternative backends that do not expose a local pathname in the way your code assumes.

The forcedownload parameter deserves a deliberate decision. Trusted content that needs inline display, such as an image managed by the plugin, may use different behavior from a file uploaded by a student that should not be interpreted by the browser in the site's own context. Content security does not end when the capability check passes.

## 9.35 File URLs

A Moodle file URL represents the logical identity required to reach the callback. That is why you see contextid, component, filearea, itemid, and path embedded in a `pluginfile.php` route. This does not expose the object's physical path because that information is simply not part of the public contract.

Do not confuse a hard-to-guess URL with authorization either. Even if itemid is large or filename unusual, the callback must still validate the user. Security through obscurity in a protected URL usually lasts until somebody opens the browser Network panel.

## 9.36 moodle_url::make_pluginfile_url()

Use `moodle_url::make_pluginfile_url()` when you have a `stored_file` or know the fields identifying the file. The helper builds the URL according to Moodle conventions and avoids manual concatenation involving slashes, encoding, and itemid.

It is even possible to omit itemid using `null` in areas that do not need it, but this decision must remain consistent with how the callback interprets its arguments. Do not change the URL structure on one side and expect the other to guess.

```php
$url = moodle_url::make_pluginfile_url(
    $file->get_contextid(),
    $file->get_component(),
    $file->get_filearea(),
    $file->get_itemid(),
    $file->get_filepath(),
    $file->get_filename(),
    true
);
```

## 9.37 Temporary files

Not every file appearing during processing needs to enter File Storage. If you are converting video, generating PDF, extracting an archive, or preparing an import, there may be a temporary stage on disk. The important thing is not to confuse that intermediate artifact with a final file belonging to Moodle content.

Use appropriate temporary directories, unpredictable names, and guaranteed cleanup, then send the final result into the Files API when it genuinely becomes part of site content. In a cluster, remember that `$CFG->tempdir` may need to be shared depending on the flow, while local directories only work when the same process or node completes the entire operation.

## 9.38 trashdir

When files are no longer referenced, Moodle may move them into a trash area before permanent removal according to filesystem behavior and cleanup tasks. `trashdir` is not a filearea belonging to your plugin and should not be used as a business recovery mechanism.

If your application needs a functional recycle bin, versioning, or user-facing document restore, model that in the business rules. Depending on temporary content remaining inside `trashdir` means depending on an operational detail that can be cleaned without considering your plugin's semantics.

## 9.39 Alternative File Systems

The File System architecture allows the physical layer to be replaced with another implementation. The plugin continues seeing `file_storage` and `stored_file`, while the backend can fetch and write content in remote storage. This is one of the best proofs that accessing `filedir` directly is an architectural error: `filedir` may simply stop being where the content lives.

The mechanism is configured before bootstrap through `$CFG->alternative_file_system_class`. The selected class implements the storage strategy used by core. From that point on, well-written code continues working without modification because it never assumed `stored_file` corresponded to a local pathname.

## 9.40 Local storage versus object storage

Local disk is simple, fast, and inexpensive for small installations, especially when there is a single server and the volume fits comfortably on the machine. Problems appear as the site grows, enters a cluster, or starts carrying hundreds of gigabytes or terabytes of content. Expanding VM disks, replicating storage among nodes, and planning recovery become part of normal operations.

Object storage such as S3, DigitalOcean Spaces, and compatible services separates storage capacity from the lifetime of the web server. This makes it easier to scale space, rebuild nodes, use durability policies, and, in some architectures, deliver selected content through a CDN or signed URLs. It is not automatically faster in every scenario because latency, request cost, and access patterns matter, but it completely changes how a large installation is operated.

There is also a difference between moving the whole `dataroot` onto a network filesystem and using an Alternative File System specifically for Files API content. `cache`, `localcache`, `temp`, sessions, and other directories have different characteristics and should not all be pushed to object storage as though they were equivalent to `filedir`.

## 9.41 A real example with local_alternative_file_system

A concrete example of this architecture is `local_alternative_file_system`, available at https://github.com/EduardoKrausME/moodle-local_alternative_file_system.. The purpose of the plugin is to replace the physical implementation used by the Files API without requiring other Moodle components to know about S3, DigitalOcean Spaces, or another remote backend. This is very different from a plugin that intercepts uploads for one specific activity. Here the replacement happens at the Moodle File System layer, below `file_storage` and `stored_file`, so the rest of the application continues using the same APIs it already used.

This distinction matters because the plugin does not attempt to create a second infrastructure parallel to `filedir`. It implements the abstraction Moodle itself provides for replacing the physical backend and is activated through `$CFG->alternative_file_system_class`. In practice, a `mod_assign`, a `mod_forum`, a local plugin, or core itself continues asking the Files API to create, read, or serve a file, while the `external_file_system` class decides whether that content is handled by the local backend or configured storage. To the consuming component, that decision should be invisible.

### 9.41.1 The most important point is that the plugin works below File Storage

When an ordinary plugin calls `get_file_storage()` and then `create_file_from_pathname()`, it should not know where the content will ultimately live. `local_alternative_file_system` takes advantage of exactly that boundary. The main class extends `file_system`, receives the operations core would perform over `file_system_filedir`, and delegates to the implementation corresponding to the configured destination. This preserves Moodle's architecture instead of bypassing it.

In practice, methods such as `add_file_from_path()`, `add_file_from_string()`, `copy_content_from_storedfile()`, `readfile()`, `get_remote_path_from_hash()`, and `remove_file()` remain part of the File System contract. The component creating a file does not need to be modified to call an S3 SDK, does not need to know the bucket, and does not need to store a remote URL in its own table. The storage plugin owns this problem in one place.

This centralization has an important maintenance consequence. If the institution switches tomorrow from DigitalOcean Spaces to another S3-compatible service, the work remains concentrated in the storage backend and configuration instead of every plugin using files. That is the difference between using an abstraction and merely replacing `file_put_contents()` with SDK calls scattered through the codebase.

### 9.41.2 How the Alternative File System is activated

Activation has to happen in `config.php` before `lib/setup.php` because File System is a structural dependency initialized during bootstrap. Once Moodle finishes setup, it is too late to try replacing this backend as though it were an ordinary visual setting.

```php
$CFG->alternative_file_system_class =
    '\\local_alternative_file_system\\external_file_system';

require_once(__DIR__ . '/lib/setup.php');
```

This detail also explains why merely installing the plugin and checking a box in administration is not enough. The code must exist before bootstrap completes and core must know which class to use when creating the filesystem layer. The settings page then deals with destination, region, credentials, bucket, and path, but implementation selection happens in `config.php`.

### 9.41.3 Supported destinations and S3 compatibility

The README documents AWS S3 and DigitalOcean Spaces as the main destinations. Current code also has a `s3generic` option, with configurable endpoint and a choice among virtual-hosted URL, path-style, or automatic detection, allowing work with services that implement the S3 API without necessarily being AWS. This is useful for regional providers, private appliances, and environments already using S3-compatible object storage.

The implementation separates configuration from backend, so region, access key, secret, bucket, and prefix can change without modifying components using the Files API. With Spaces, behavior remains based on the S3-compatible protocol, but endpoint and region configuration belong to the backend, not the Moodle plugin that saved the document.

I would avoid marketing this as "any S3 works automatically" because compatible implementations can differ in signing, path-style, headers, or edge-case behavior, but architecturally the plugin already provides the correct place to deal with those differences without contaminating the rest of Moodle.

### 9.41.4 Migrating moodledata/filedir to the cloud

One of the plugin's most useful characteristics is that it does not require starting from an empty Moodle site. The migration flow iterates over existing `contenthash` values in `{files}`, identifies content not yet sent to the configured destination, and copies the corresponding physical object from `moodledata/filedir` to remote storage. This takes advantage of Moodle's own deduplication because migration works by `contenthash` rather than by every logical row in `files`.

If the same content is referenced twenty times in different fileareas, the physical object only needs to be uploaded once. This is operationally important on large installations because the number of rows in `{files}` can be much greater than the number of distinct contents actually needing to cross the network.

The plugin maintains its own table tracking hashes uploaded per destination and calculates how many contents remain. The settings screen can compare the expected total with the amount already uploaded and warn when migration has not finished. This is much better than starting an external `aws s3 sync` and simply hoping Moodle and the bucket ended up with the same set of objects.

### 9.41.5 Migration does not need to be a one-way jump

The repository also contains the reverse path, bringing files from remote storage back into local `filedir`. This matters because changing storage is a serious infrastructure operation and should have a rollback strategy. If latency, cost, institutional policy, or another factor makes the remote backend unsuitable, there is a way to rebuild the local pool from the `contenthash` values known to Moodle.

Having a return path does not remove the need for backup, testing, and a maintenance window, but substantially changes operational risk. Adoption does not have to be treated as a destructive conversion where the only valid bytes now exist in a technology you cannot leave without writing another migration project.

### 9.41.6 Migration from tool_objectfs

Another scenario explicitly described in the README is migration from installations already using `tool_objectfs`. While the old alternative class is still active, `local_alternative_file_system` administration can detect that configuration, apply its data to the new plugin, and perform the required tests. After validation, the administrator changes `$CFG->alternative_file_system_class` to the class provided by the new backend.

This is a practical advantage because storage problems usually appear on large Moodle sites, and large Moodle sites rarely start from zero. Being able to migrate from an existing solution reduces adoption cost and avoids forcing the institution to bring every file back to local disk only to upload it again to the same bucket or another destination.

### 9.41.7 The plugin preserves Moodle's contenthash logic

The remote path remains derived from `contenthash`, preserving a multilevel distribution similar to `filedir`, with the first characters forming path segments and the complete hash identifying the object. This choice is simple and very coherent with the Files API because the remote backend stores the same concept the standard filesystem already stored: content identified by hash.

This means the bucket does not need to know `courseid`, `userid`, `component`, `filearea`, or `filename`. That metadata remains in Moodle's database, where it belongs. Remote storage gets the content while logical identity remains in `{files}`. Not duplicating the whole logical tree inside the bucket is an advantage because it avoids turning S3 into a second metadata database that would need to remain synchronized with Moodle.

### 9.41.8 Remote reading and authenticated URLs

In the S3 backend, the implementation can generate a temporary authenticated URL for an object. This allows some reads to use a remote resource without making the bucket public. URL lifetime and exact consumption belong to the filesystem implementation, while Moodle components continue working with `stored_file`.

This model is useful because the bucket can remain private while still providing controlled access to content. It is very different from simply marking all objects public and storing permanent URLs in a plugin table. Moodle authorization remains in the flow deciding which file the user may request, and the storage layer can use temporary credentials to retrieve the object when necessary.

### 9.41.9 Compatibility with code requiring a local seekable file

Object storage does not behave like a POSIX disk and some Moodle APIs or PHP libraries still expect a handle on which `fseek()` works. This appears especially with range requests, streaming, and some flows used by the mobile app. The plugin handles this case by materializing a temporary local copy for the request when the consumer requires a seekable file instead of forcing the whole installation to permanently retain the content in `filedir`.

In the current implementation, larger files may be copied into a request-specific temporary directory and reused during that cycle through a local in-memory cache. This detail matters because it shows a more realistic architecture than the simplistic idea that "if it is on S3 it never touches disk." Some operations need local staging, and the correct place for that is a controlled temporary copy, not a permanent dependency on `filedir`.

### 9.41.10 Why this is better than each plugin talking directly to S3

It is technically possible to write `mod_meuvideo` with an AWS SDK, `local_documentos` with another library for Spaces, and `block_arquivos` with a third implementation, but this creates three authentication systems, three retry strategies, three URL formats, three removal policies, and, worse, three different ways of ignoring the Files API. The first upload is quick to build and the bill arrives when backup, restore, privacy, activity copying, and access control start depending on those files.

With an Alternative File System, business plugins continue using the native API. This is perhaps the greatest architectural advantage of `local_alternative_file_system`: it moves the infrastructure decision into the layer where that decision belongs. The Assignment module should not know that a bucket exists, just as it should not know whether the database is PostgreSQL or MariaDB.

## 9.42 Advantages and limits of remote storage

Saying only that object storage "saves disk" reduces the problem too much. The most interesting gain appears when storage stops being a physical property of the Moodle server and becomes an independent service with its own capacity, durability, and lifecycle. This changes deployment, clustering, recovery, expansion, and even how you replace a web server that dies at three in the morning.

### 9.42.1 Server disk no longer defines Moodle's maximum size

With local installation, growth of `filedir` often forces expansion of the VM volume, migration to a larger disk, or adoption of a shared filesystem. With object storage, capacity grows independently from the web node, so file expansion no longer requires the same intervention on the server running PHP. For environments storing a lot of video, PDF, SCORM, H5P, and attachments, this operational separation is enormous.

It also reduces coupling between CPU and storage. You may need to double processing capacity without duplicating hundreds of gigabytes of disk on every new server, or grow storage without replacing the Moodle machine. These are different resources and can scale more independently.

### 9.42.2 Clustering becomes much simpler

In a cluster, all nodes need to see the same permanent content. The traditional solution is NFS, Ceph, Gluster, a provider shared volume, or another common POSIX layer. Each works, but adds its own availability, latency, locking, tuning, and operational burden. When `filedir` uses object storage through Moodle's File System, web nodes stop depending on a complete local copy of content and access the same remote backend instead.

This does not eliminate every shared Moodle directory or turn the entire `moodledata` into S3. `sessions`, `temp`, `cache`, and `localcache` still have their own requirements. The advantage is removing the largest permanent space consumer, `filedir`, from dependence on each node's local disk.

### 9.42.3 Replacing or rebuilding a server becomes less traumatic

When application and permanent content are on the same disk, losing or rebuilding the server means restoring a potentially enormous amount of files too. Separating `filedir` makes the web node much more disposable. You can rebuild the machine, reinstall code, point it at shared database, caches, and storage, and resume operation without copying the entire file pool onto that server.

This fits much better with immutable infrastructure, autoscaling, and server images. The server stops being the place where the institution's digital assets live and becomes primarily an executor of the application.

### 9.42.4 Content durability and availability

Services such as S3 and Spaces are designed to store objects using their own replication and durability mechanisms. This reduces dependence on one local volume and avoids making failure of the Moodle server disk also be failure of the institution's content repository. Obviously this does not eliminate backups or a disaster-recovery policy, but it significantly changes the risk profile.

It can also make bucket versioning, cross-region replication, and lifecycle policies easier to use when the provider supports them, although each organization has to decide whether and how those capabilities fit into its strategy. The plugin should not claim object storage replaces backup because it does not. It provides a storage layer better suited to scale; backup remains a separate responsibility.

### 9.42.5 Less I/O pressure on the Moodle server

Uploads and file reads stop depending exclusively on the local volume that may also be serving logs, temporary files, caches, and other system operations. Depending on the flow, part of the read/write workload can move to the remote backend, reducing pressure on application storage.

This does not mean Moodle CPU and network magically disappear from the path. Some downloads still pass through PHP and some operations materialize files temporarily, so the benefit must be measured in the real workflow. Even so, separating the permanent pool prevents repository growth from inevitably turning the local filesystem into the installation bottleneck.

### 9.42.6 CDN and geographic distribution when architecture permits

Object storage normally integrates with CDNs much more naturally than a private directory on a VM. In scenarios where access policy and implementation allow content to be delivered through authenticated URLs or a distribution layer, users far from the datacenter can receive files from a geographically closer location, reducing latency and direct traffic through the Moodle server.

But it is important not to sell magic here. If every download still has to be read by PHP and retransmitted through the Moodle server, the remote bucket does not eliminate that traffic. CDN benefits appear when the delivery design actually allows part of the path to be offloaded to the appropriate layer while preserving access control and temporary URLs when required.

### 9.42.7 Security and separation of responsibilities

The bucket can remain private, with credentials restricted to the backend and specific read/write policies. The web server does not need to expose `filedir` and business plugins do not need access key, secret, or endpoint details. Credentials stay concentrated in the storage component and can be managed by infrastructure operations.

This separation reduces the number of places where a cloud secret appears and prevents each plugin from inventing its own URL signing method. Security still depends on `pluginfile()`, capabilities, and application access rules, but the infrastructure is less scattered.

### 9.42.8 Gradual, verifiable migration

`local_alternative_file_system` has an important practical advantage over migration performed only with external tools: it knows the `contenthash` values Moodle actually references and can report how many objects are still missing from the destination. This allows progressive migration to be tracked and pool coverage to be verified instead of only comparing directory counts or bytes.

For very large installations, this helps run migration in stages and reduces the need for one enormous outage just to copy the whole repository at once. The exact strategy still depends on volume, network, and change window, but the plugin already understands the data model in a way a generic sync tool does not.

### 9.42.9 Compatibility with the Moodle ecosystem

Perhaps the greatest advantage for plugin developers is transparency. If your component uses `stored_file`, `get_file_storage()`, fileareas, `pluginfile()`, and official APIs, it does not need to acquire a `if ($uses3)` anywhere. The backend changes and the code remains the same.

This is also an architecture test. If enabling an Alternative File System breaks your plugin, there is probably an improper dependency on a physical pathname. Instead of treating this as a storage incompatibility, investigate where the component escaped Moodle's abstraction.

### 9.42.10 Costs and limits that need consideration

Object storage has its own bill too. There is network latency, per-operation cost, possible egress charges, provider dependence, and behavioral differences compared with a local filesystem. Large numbers of small files can generate a huge number of requests, while flows doing many random reads of the same file may suffer more than they would on local SSD.

That is why the decision should not be "cloud is better" but "which operational problem am I trying to solve?" A small Moodle site on one server with 40 GB of content can run perfectly on local disk for years. An installation with multiple nodes, hundreds of gigabytes, or unpredictable growth benefits much more from separating compute from storage.

Another limitation is that object storage should not be treated as a direct replacement for the whole `moodledata`. The value of the plugin lies precisely in integrating the Files API file pool with the remote backend. `temp`, `localcache`, sessions, and caches have different semantics and require their own design.

## 9.43 Why a plugin must not assume the physical file is on local disk

Sometimes a local-disk dependency appears in disguise. A developer gets a `stored_file`, calls some function returning a temporary pathname and passes that path to an external library, or worse, reconstructs `filedir/aa/bb/hash` manually because they know the default organization. The code works on a notebook and traditional server, so the problem goes unnoticed until the first Alternative File System environment.

When a library requires a real pathname, treat that as an integration boundary. Materialize a controlled temporary copy, process the file, and remove the temporary file afterward. Do not turn an external library requirement into a permanent assumption that the entire storage layer is local.

This also helps testing. A service receiving `stored_file` or abstract content is much easier to test than a class full of paths built with `$CFG->dataroot`.

## 9.44 Files API, backup, and restore

The relationship among context, component, filearea, and itemid is one of the reasons Moodle can participate consistently in backup and restore. Chapter 24 will cover filearea annotation in detail, but already keep in mind that files do not live separately from component structure.

If you invent your own directory outside the Files API to store activity documents, standard backup does not automatically know what to do with it. Now you need parallel mechanisms for copy, restore, cleanup, and migration. A five-line shortcut during upload becomes debt in every later lifecycle.

## 9.45 Files API and security

The Files API does not replace authorization, but it provides the correct place to apply it. The file remains outside the web root, the URL passes through `pluginfile.php`, and the component gets the chance to decide whether the user may access that resource. This is a much better architecture than placing content under `/uploads` and trying to protect it with a random name.

On the other hand, a badly implemented `pluginfile()` destroys this advantage. If the callback only builds `get_file()` from received arguments and sends the result, it can create file IDOR even when the filearea is perfectly organized. Context and capability need to be related to the real record, exactly as we saw in Chapter 8.

## 9.46 Errors that appear in production

Some mistakes recur so often that they are worth recognizing by smell. The first is storing uploads in a custom directory inside moodledata. The second is storing a physical pathname in the database. The third is querying `{files}` and manipulating rows directly. The fourth is keeping draftitemid as a permanent reference. The fifth is building file URLs through concatenation. The sixth is implementing `pluginfile()` without validating the object to which itemid belongs.

There is also a seventh, more subtle mistake: doing everything correctly with the Files API but later, in a specific integration, assuming `$file->get_contenthash()` can be turned into a pathname under `filedir`. That detail couples the plugin to the default backend and is usually only discovered during migration to object storage, when the installation has already become far too large for a relaxed fix.

## 9.47 Exercise - private file library with access control

To close the chapter, create a private library inside a plugin where each record belongs to a course and has several documents. The form should use filemanager, prepare existing files in draft during editing, and save the final set after submission. Each record should use its own id as `itemid` and the filearea may be called `document`.

Then implement the listing using `get_area_files()` and generate URLs with `moodle_url::make_pluginfile_url()`. The `pluginfile()` callback must validate module context, course login, view capability, and, most importantly, confirm that the received itemid belongs to the current instance before locating the `stored_file`. Manually alter itemid and filename in the URL and confirm unauthorized access fails.

Finally, review the code looking for any reference to `moodledata/filedir`, any pathname stored in the database, and any use of `file_get_contents()` on a permanent physical path. The exercise is only complete when the plugin remains architecturally correct even if tomorrow `$CFG->alternative_file_system_class` points to an S3 backend.

## 9.48 The mental model that should remain

After working with the Files API for a while, the most useful mental model is simple. A Moodle file is not a pathname. It is a logical identity formed by context, component, area, item, path, and name, linked to content identified by hash and stored by a backend the plugin does not need to know. Once you think this way, `filedir`, S3, and Spaces become infrastructure details while code continues operating on `file_storage` and `stored_file`.

This separation is what allows Moodle to deduplicate content, protect downloads, move data between environments, participate in backup and restore, and replace the physical backend without rewriting each plugin. It may look like more work than `move_uploaded_file()` in the first fifty lines, but it is far less work than maintaining a second file infrastructure invented inside your component for years.

If I could summarize this chapter in one rule, it would be this: when a file is part of Moodle content, let Moodle own it. Use the Files API, correctly describe where that file belongs, and keep your plugin away from physical paths. The day an installation moves from one server to a cluster or from local disk to object storage is when this decision stops looking pedantic and starts looking obvious.

## Technical references consulted

* Moodle Developer Resources. File API, version 5.2. Available at moodledev.io/docs/5.2/apis/subsystems/files.
* Moodle Developer Resources. File API internals, version 5.2. Available at moodledev.io/docs/5.2/apis/subsystems/files/internals.
* Moodle Developer Resources. Files in Forms. Documentation for draft areas, filemanager, and editor flows.
* Moodle core. `public/lib/filestorage/file_storage.php`, current implementation of `get_pathname_hash()` and File Storage.
* EduardoKrausME. `moodle-local_alternative_file_system`. Alternative File System implementation for Moodle, with AWS S3, DigitalOcean Spaces, S3-compatible endpoint support, filedir migration, migration from tool_objectfs, and return to local storage. Available at https://github.com/EduardoKrausME/moodle-local_alternative_file_system.

{% endraw %}