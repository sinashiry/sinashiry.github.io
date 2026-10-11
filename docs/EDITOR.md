# Editing the website

This guide is for the owner of sina-shiri.com. The website is a set of static pages built
from the public GitHub repository `sinashiry/sinashiry.github.io`. You edit its text, CVs,
blog posts and papers in **Pages CMS** (https://app.pagescms.org/), a separate editing service
that saves your changes into that repository. The page https://sina-shiri.com/admin/ links to
the editor and to the deploy status.

## Before you start: everything you save is public

The repository is public. Anything saved in Pages CMS is visible on GitHub, with its full
history, **as soon as you save it**, even if the website does not show it yet. This includes
draft posts, unapproved recommendations, referee names and email addresses, and every uploaded
file, including older CV versions. Save only what may be public. Removing something later does
not remove it from the history.

## One-time setup

1. Open https://app.pagescms.org/ and choose to sign in with GitHub. Use the **sinashiry**
   GitHub account.
2. When Pages CMS asks, install its GitHub app. Choose **Only select repositories** and select
   **sinashiry.github.io**. Review the permissions GitHub shows, then confirm.
3. Recommended: in GitHub, open Settings › Emails and turn on **Keep my email addresses
   private**, so that changes saved in Pages CMS show a GitHub no-reply address instead of your
   email address.
4. Back in Pages CMS, open **sinashiry / sinashiry.github.io** and the **main** branch.

To remove the editor's access later, open GitHub Settings › Applications › Installed GitHub
Apps, then restrict or uninstall Pages CMS.

## Editing text

1. Pick a section in the left sidebar, for example *Profile & CV › Experience* or
   *Engineering projects › Fire & smoke vision*.
2. Change the text. The editor enforces length limits, and many fields show a short
   explanation underneath.
3. Select **Save**. Saving on the main branch publishes the change.

Some things are fixed and need the maintainer instead:

- Fields marked *(fixed)*, such as a project's page address or an image file. They identify an
  item and cannot change.
- The number of entries in a list (roles, highlights, gallery images, paragraphs and so on).
  Edit entries in place; do not add, remove or drag them into a new order. An entry you empty
  is removed when you save, which the website check then reports.
- New projects, new sections, gallery images, videos and the page layout.

### Recommendations, references and current research

A recommendation card appears on the website only when *Approved for publication by the
author* is **yes** and its text, name and professional status are complete. Academic
references work the same way with name, position and relationship. Choose **yes** only after
the person has agreed to publication. Remember that the text is already public in the
repository the moment you save it, approved or not, so add a recommendation or a referee only
with their permission.

The *Current research* block appears only when both the research question and the contribution
are filled in.

## Replacing a CV

1. Open **Media › CV PDF versions** and upload the new PDF. Give it a clear dated name, for
   example `sina-shiri-engineering-cv-2027-01.pdf`. Uploading alone changes nothing on the
   website.
2. Open **Downloadable CVs**, select the new file in *Engineering CV* or *Academic CV*, and
   save.

After the next deploy the website serves the selected file at its usual address
(`/downloads/Sina_Shiri_Engineering_CV.pdf` or `/downloads/Sina_Shiri_Masters_CV.pdf`). Older
versions stay in the repository, so you can select one again to go back. The LaTeX sources of
the CVs are not updated by this; ask the maintainer if they should match.

## Writing a blog post or adding a paper

1. Open **Blog posts** or **Publications (papers)** and create a new entry.
2. Fill in the fields. For a post, enter the **Web address**: the post is published at
   `/blog/<web address>/`. Use lowercase letters, digits and single hyphens, at most 80
   characters, and not a reserved word such as `admin` or `blog`. The address is fixed when the
   post is first saved and cannot be changed later, so check it before saving. A paper's file
   name is made from its year and title automatically.
3. Set **Website visibility**:
   - **draft**: saved (and public in the repository) but not shown on the website. A draft may
     be unfinished, for example a header image without its description yet; the website checks
     images, links and the related project when you publish it;
   - **published**: shown on the website after the next deploy;
   - **archived**: removed from the website. A post keeps its address reserved.
4. Save.

The blog appears in the site navigation once three posts are published; the Publications page
appears once one paper is published. Images and paper PDFs uploaded for posts and papers are
public as soon as they are uploaded. Upload them straight into the media library; folders are
not needed (an empty folder is ignored and never appears on the website). Posts cannot be
deleted or renamed; archive them instead. Papers can be deleted, but archiving keeps them
available for later.

## How long it takes

Every save starts an automatic check and rebuild of the whole website. The change is usually
live a few minutes after you save. Follow the progress on the repository's Actions tab:
https://github.com/sinashiry/sinashiry.github.io/actions

If a check fails, the live website stays exactly as it was. The failed run lists each problem
with the section and field to correct, for example
`Engineering projects › Fire & smoke vision › Approach: has 2 entries, but the website needs
exactly 3`. Correct the field in Pages CMS and save again.

The **Refresh GitHub repositories** action in Pages CMS updates the Code page from the public
repositories on GitHub. The list also refreshes automatically every few hours.

## Undoing a change

Every save is a separate change in the repository history. To go back:

- copy the earlier text into the field in Pages CMS and save again; to find the earlier text,
  open the file on GitHub (for example `content/cms/profile.json`) and choose **History**; or
- ask the maintainer to revert the change.

## Who to ask

For anything this guide does not cover, such as layout changes, new projects or sections,
gallery images, videos, a failed check you cannot resolve, or access problems, contact the
website maintainer on GitHub: @abolfazlsajadi.
